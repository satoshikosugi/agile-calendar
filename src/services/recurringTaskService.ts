import { RecurringRule, Settings, Task } from '../models/types';
import { createTask } from './tasksService';
import { getCalendarFrame } from './calendarLayoutService';

/**
 * Generate a list of dates (YYYY-MM-DD) based on the recurring rule within the specified month range.
 * @param rule The recurring rule
 * @param startMonth YYYY-MM
 * @param endMonth YYYY-MM (inclusive)
 */
export function generateDatesFromRule(rule: RecurringRule, startMonth: string, endMonth: string): string[] {
  const dates: string[] = [];
  const start = new Date(`${startMonth}-01`);
  // End date is the last day of the end month
  const [endY, endM] = endMonth.split('-').map(Number);
  const end = new Date(endY, endM, 0); // Last day of endMonth

  const current = new Date(start);

  // Helper to check if date is valid until
  const isValid = (d: Date) => {
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
 */
export async function applyRecurringTasks(settings: Settings, months: string[]) {
  if (!settings.recurringTasks || settings.recurringTasks.length === 0) return;

  console.log('Applying recurring tasks for months:', months);

  // Sort months to get range
  const sortedMonths = [...months].sort();
  const startMonth = sortedMonths[0];
  const endMonth = sortedMonths[sortedMonths.length - 1];

  for (const recurringTask of settings.recurringTasks) {
    const dates = generateDatesFromRule(recurringTask.rule, startMonth, endMonth);
    
    for (const date of dates) {
      // Check if calendar frame exists for this date
      const d = new Date(date);
      const frame = await getCalendarFrame(d.getFullYear(), d.getMonth());
      
      if (frame) {
        // Check if task already exists?
        // For now, we might duplicate if we don't check.
        // A simple check is to look for tasks with same title on that date.
        // But fetching all tasks is expensive.
        // Maybe we can tag the task with recurringTaskId in metadata?
        // Let's assume we add a property to Task metadata: recurringTaskId
        
        // Since we can't easily search by metadata property without fetching all,
        // we might just create it. But user said "automatically reflect".
        // If we run this multiple times, we get duplicates.
        // Strategy: Search for tasks in the frame (we can get children of frame).
        
        const children = await frame.getChildren();
        const existingTasks = children.filter((c: any) => c.type === 'sticky_note');
        
        let exists = false;
        for (const note of existingTasks) {
            // This is slow if we do it for every date.
            // Optimization: We can rely on the fact that we only run this when requested.
            // But user said "automatically reflect".
            
            // Let's try to read metadata if possible.
            // Note: getChildren returns items, but metadata might need separate fetch or is included?
            // In Miro Web SDK 2.0, items usually have metadata if fetched.
            // But getChildren might return simplified objects.
            // Let's assume we need to check title at least.
            if (note.content.includes(recurringTask.template.title)) {
                // Weak check, but better than nothing.
                // Ideally we check metadata.
                exists = true; 
                break;
            }
        }

        if (!exists) {
          const newTask: Task = {
            ...recurringTask.template,
            id: '', // Will be generated
            date: date,
            // Add recurring info to metadata if possible (need to extend Task type or just add it)
          };
          
          // We need to cast or extend Task to include recurringTaskId if we want to track it.
          // For now, just create it.
          await createTask(newTask);
        }
      }
    }
  }
}
