import { RecurringRule, Settings, Task } from '../models/types';
import { loadTasks, createTask } from './storageService';

export function generateDatesFromRule(rule: RecurringRule, startMonth: string, endMonth: string): string[] {
  const dates: string[] = [];
  
  const [sY, sM] = startMonth.split('-').map(Number);
  const start = new Date(sY, sM - 1, 1);
  
  const [endY, endM] = endMonth.split('-').map(Number);
  const end = new Date(endY, endM, 0);

  const current = new Date(start);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isValid = (d: Date) => {
    if (d.getTime() < today.getTime()) return false;
    if (rule.validUntil) {
      return d <= new Date(rule.validUntil);
    }
    return true;
  };

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (rule.frequency === 'weekly') {
    if (!rule.weekDays || rule.weekDays.length === 0) return [];
    
    while (current <= end) {
      if (isValid(current)) {
        if (rule.weekDays.includes(current.getDay())) {
          dates.push(formatDate(current));
        }
      }
      current.setDate(current.getDate() + 1);
    }
  } else if (rule.frequency === 'monthly') {
    current.setDate(1);
    
    while (current <= end) {
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
          if (rule.weekNumber !== undefined && rule.dayOfWeek !== undefined) {
            let day = 1;
            while (new Date(year, month, day).getDay() !== rule.dayOfWeek) {
              day++;
            }
            day += (rule.weekNumber - 1) * 7;
            if (day <= new Date(year, month + 1, 0).getDate()) {
              targetDate = new Date(year, month, day);
            }
          }
        }

        if (targetDate && targetDate >= start && targetDate <= end && isValid(targetDate)) {
          dates.push(formatDate(targetDate));
        }
      }
      
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}

export async function applyRecurringTasks(
  settings: Settings, 
  months: string[],
  onProgress?: (message: string) => void
) {
  if (!settings.recurringTasks || settings.recurringTasks.length === 0) return;

  if (onProgress) onProgress('既存のタスクを確認中...');

  const sortedMonths = [...months].sort();
  const startMonth = sortedMonths[0];
  const endMonth = sortedMonths[sortedMonths.length - 1];

  const existingTasks = await loadTasks();

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

      const exists = existingTasks.some(t => 
        (t.recurringTaskId === recurringTask.id && t.date === date) ||
        (t.title === recurringTask.template.title && t.date === date)
      );

      if (!exists) {
        const newTask: Task = {
          ...recurringTask.template,
          id: '',
          date: date,
          recurringTaskId: recurringTask.id
        };
        
        try {
          if (onProgress) {
            onProgress(`${percentage}% [${processedCount}/${totalTasks}] ${recurringTask.template.title} (${date}) を作成中...`);
          }
          const created = await createTask(newTask);
          existingTasks.push(created);
        } catch (e) {
          console.error(`Failed to create recurring task for ${date}`, e);
        }
      }
    }
  }
}
