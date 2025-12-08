import { RecurringRule, Settings, Task } from '../models/types';
import { createTask, reorganizeTasksOnDate } from './tasksService';
import { getCalendarFrame } from './calendarLayoutService';
import { miro } from '../miro';
import { withRetry } from '../utils/retry';

/**
 * Generate a list of dates (YYYY-MM-DD) based on the recurring rule within the specified month range.
 * @param rule The recurring rule
 * @param startMonth YYYY-MM
 * @param endMonth YYYY-MM (inclusive)
 */
export function generateDatesFromRule(rule: RecurringRule, startMonth: string, endMonth: string): string[] {
  const dates: string[] = [];
  
  // Use local time construction to avoid UTC issues
  const [sY, sM] = startMonth.split('-').map(Number);
  const start = new Date(sY, sM - 1, 1);
  
  const [endY, endM] = endMonth.split('-').map(Number);
  const end = new Date(endY, endM, 0); // Last day of endMonth

  const current = new Date(start);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to check if date is valid until
  const isValid = (d: Date) => {
    // Compare timestamps to be safe
    if (d.getTime() < today.getTime()) return false; // Don't generate tasks in the past
    if (rule.validUntil) {
      return d <= new Date(rule.validUntil);
    }
    return true;
  };

  // Helper to format YYYY-MM-DD
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (rule.frequency === 'weekly') {
    if (!rule.weekDays || rule.weekDays.length === 0) return [];
    
    // Iterate day by day
    while (current <= end) {
      if (isValid(current)) {
        if (rule.weekDays.includes(current.getDay())) {
          dates.push(formatDate(current));
        }
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (rule.frequency === 'monthly') {
    // Iterate month by month
    // Adjust current to start of month
    current.setDate(1);
    
    while (current <= end) {
      // Check interval
      // For simplicity, assume interval starts from the first month in range or some epoch.
      // Ideally, interval should be based on a start date of the recurring task, but we don't have that in the rule.
      // We'll assume the interval applies relative to the startMonth for now, or just every N months from startMonth.
      // Better: Check if (monthDiff % interval) === 0.
      // Let's calculate month difference from startMonth.
      const monthDiff = (current.getFullYear() - start.getFullYear()) * 12 + (current.getMonth() - start.getMonth());
      const interval = rule.intervalMonths || 1;
      
      if (monthDiff % interval === 0) {
        const year = current.getFullYear();
        const month = current.getMonth();
        
        let targetDate: Date | null = null;

        if (rule.monthDayType === 'startOfMonth') {
          targetDate = new Date(year, month, 1);
        } else if (rule.monthDayType === 'endOfMonth') {
          targetDate = new Date(year, month + 1, 0);
        } else if (rule.monthDayType === 'specificDay') {
          // Nth Day of Week
          // e.g. 2nd Tuesday
          if (rule.weekNumber !== undefined && rule.dayOfWeek !== undefined) {
            let day = 1;
            
            // Find first occurrence of dayOfWeek
            while (new Date(year, month, day).getDay() !== rule.dayOfWeek) {
              day++;
            }
            
            // Add (weekNumber - 1) weeks
            day += (rule.weekNumber - 1) * 7;
            
            // Check if still in month
            if (day <= new Date(year, month + 1, 0).getDate()) {
              targetDate = new Date(year, month, day);
            }
          }
        }

        if (targetDate && targetDate >= start && targetDate <= end && isValid(targetDate)) {
          dates.push(formatDate(targetDate));
        }
      }
      
      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}

/**
 * Apply recurring tasks to the specified months.
 * @param settings Current settings containing recurring tasks
 * @param months List of months (YYYY-MM) to apply to
 * @param onProgress Optional callback to report progress
 */
export async function applyRecurringTasks(
  settings: Settings, 
  months: string[],
  onProgress?: (message: string) => void
) {
  if (!settings.recurringTasks || settings.recurringTasks.length === 0) return;

  console.log('Applying recurring tasks for months:', months);
  if (onProgress) onProgress('既存のタスクを確認中...');

  // Sort months to get range
  const sortedMonths = [...months].sort();
  const startMonth = sortedMonths[0];
  const endMonth = sortedMonths[sortedMonths.length - 1];

  // Pre-fetch all sticky notes to check for duplicates globally
  // This is safer than checking frame children, as tasks might be moved out of frames
  const allStickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
  const existingTasksMap = new Map<string, any[]>(); // Key: date, Value: notes

  // Build map of existing tasks by date
  for (const note of allStickyNotes) {
      try {
          const metadata = await note.getMetadata('task');
          if (metadata && metadata.date) {
              if (!existingTasksMap.has(metadata.date)) {
                  existingTasksMap.set(metadata.date, []);
              }
              existingTasksMap.get(metadata.date)?.push({ note, metadata });
          }
      } catch (e) {
          // ignore
      }
  }

  const affectedDates = new Set<string>();
  let processedCount = 0;
  const totalTasks = settings.recurringTasks.length;

  for (const recurringTask of settings.recurringTasks) {
    processedCount++;
    const percentage = Math.round((processedCount / totalTasks) * 100);
    const dates = generateDatesFromRule(recurringTask.rule, startMonth, endMonth);
    
    for (const date of dates) {
      if (onProgress) {
        onProgress(`${percentage}% [${processedCount}/${totalTasks}] ${recurringTask.template.title} (${date}) を確認中...`);
      }

      // Check if calendar frame exists for this date
      const d = new Date(date);
      const frame = await getCalendarFrame(d.getFullYear(), d.getMonth());
      
      if (frame) {
        // Check if task already exists using global map
        const tasksOnDate = existingTasksMap.get(date) || [];
        let exists = false;
        
        for (const { metadata } of tasksOnDate) {
            // Check by recurringTaskId if available (strong check)
            if (metadata.recurringTaskId === recurringTask.id) {
                exists = true;
                break;
            }
            // Fallback: Check by title (weak check for legacy tasks)
            if (metadata.title === recurringTask.template.title) {
                exists = true;
                
                // Self-healing: If found by title but missing recurringTaskId, update it?
                // This would fix the "Selection" issue if we update the ID too.
                // But updating here is complex. Let's just prevent duplicate creation.
                break;
            }
        }

        if (!exists) {
          const newTask: Task = {
            ...recurringTask.template,
            id: '', // Will be generated by createTask using sticky note ID
            date: date,
            recurringTaskId: recurringTask.id
          };
          
          try {
            if (onProgress) {
                onProgress(`${percentage}% [${processedCount}/${totalTasks}] ${recurringTask.template.title} (${date}) を作成中...`);
            }
            await createTask(newTask, { skipReorganize: true });
            affectedDates.add(date);
          } catch (e) {
            console.error(`Failed to create recurring task for ${date}`, e);
            // Continue with other tasks even if one fails
          }
        }
      }
    }
  }

  // Batch reorganize affected dates
  if (affectedDates.size > 0) {
      console.log('Reorganizing affected dates:', Array.from(affectedDates));
      if (onProgress) onProgress('タスクの配置を調整中...');
      
      // Fetch all notes again to include newly created ones
      // This is necessary because createTask creates new notes that are not in our initial allStickyNotes list
      const updatedStickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
      
      // Group by date
      const notesByDate = new Map<string, { note: any, task: Task }[]>();
      
      // Batch metadata fetching
      const BATCH_SIZE = 10;
      for (let i = 0; i < updatedStickyNotes.length; i += BATCH_SIZE) {
          const batch = updatedStickyNotes.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (note) => {
              try {
                  const metadata = await note.getMetadata('task');
                  if (metadata && (metadata as Task).date) {
                      const task = metadata as Task;
                      const date = task.date;
                      if (date) {
                          if (!notesByDate.has(date)) {
                              notesByDate.set(date, []);
                          }
                          notesByDate.get(date)!.push({ note, task });
                      }
                  }
              } catch (e) { }
          }));
      }

      for (const date of affectedDates) {
          const notesForDate = notesByDate.get(date) || [];
          await reorganizeTasksOnDate(date, undefined, notesForDate);
      }
  }
}
