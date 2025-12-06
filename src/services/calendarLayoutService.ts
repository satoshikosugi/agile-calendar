import { miro } from '../miro';
import { Settings, Task } from '../models/types';

// Generate 3-month calendar frames on the board
export async function generateCalendar(settings: Settings): Promise<void> {
  const baseDate = new Date(settings.baseMonth + '-01');
  const months: Date[] = [];
  
  // Generate 3 months: baseMonth-1, baseMonth, baseMonth+1
  for (let i = -1; i <= 1; i++) {
    const monthDate = new Date(baseDate);
    monthDate.setMonth(baseDate.getMonth() + i);
    months.push(monthDate);
  }
  
  // New larger dimensions for monthly calendar layout
  const frameWidth = 2800; // 7 days * 400px per day
  const frameHeight = 2400; // 6 weeks * 400px per week
  const frameSpacing = 300;
  const startX = 0;
  const startY = 0;
  
  // Create frames for each month
  for (let i = 0; i < months.length; i++) {
    const monthDate = months[i];
    const monthStr = monthDate.toISOString().substring(0, 7); // YYYY-MM
    
    // Check if frame already exists
    const existingFrames = await miro.board.get({ type: 'frame' });
    const frameExists = existingFrames.some(
      (frame: any) => frame.title === `Calendar ${monthStr}`
    );
    
    if (!frameExists) {
      const x = startX + i * (frameWidth + frameSpacing);
      const y = startY;
      
      const frame = await miro.board.createFrame({
        title: `Calendar ${monthStr}`,
        x,
        y,
        width: frameWidth,
        height: frameHeight,
        style: {
          fillColor: '#ffffff',
        },
      });
      
      // Add monthly calendar structure within the frame
      await createMonthlyCalendarGrid(frame, monthDate, settings);
    }
  }
}

// Create a monthly calendar grid (weeks as rows, days as columns)
async function createMonthlyCalendarGrid(
  frame: any,
  monthDate: Date,
  _settings: Settings
): Promise<void> {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  
  const frameX = frame.x;
  const frameY = frame.y;
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  
  // Calendar layout constants
  const headerHeight = 80;
  const dayOfWeekHeaderHeight = 40;
  const colWidth = frameWidth / 7; // 7 days per week
  const numWeeks = 6; // Max weeks in a month
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  // Month title
  const monthNameJa = ['1月', '2月', '3月', '4月', '5月', '6月',
                       '7月', '8月', '9月', '10月', '11月', '12月'];
  
  await miro.board.createText({
    content: `${year}年 ${monthNameJa[month]}`,
    x: frameX,
    y: frameY - frameHeight / 2 + headerHeight / 2,
    width: frameWidth - 40,
    style: {
      fontSize: 24,
      fontFamily: 'arial',
      color: '#1a1a1a',
      textAlign: 'center',
      fillColor: 'transparent',
    },
  });
  
  // Day of week headers (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土'];
  const weekendDays = [0, 6]; // Sunday and Saturday
  
  for (let dow = 0; dow < 7; dow++) {
    const x = frameX - frameWidth / 2 + colWidth * (dow + 0.5);
    const y = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight / 2;
    const isWeekend = weekendDays.includes(dow);
    
    await miro.board.createText({
      content: daysOfWeek[dow],
      x,
      y,
      width: colWidth - 10,
      style: {
        fontSize: 16,
        fontFamily: 'arial',
        color: isWeekend ? '#d32f2f' : '#424242',
        textAlign: 'center',
        fillColor: 'transparent',
      },
    });
  }
  
  // Draw grid lines and day numbers
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Draw cells for each day
  let dayCounter = 1;
  for (let week = 0; week < numWeeks; week++) {
    for (let dow = 0; dow < 7; dow++) {
      const cellX = frameX - frameWidth / 2 + colWidth * dow;
      const cellY = contentStartY + rowHeight * week;
      const isWeekend = weekendDays.includes(dow);
      
      // Draw cell background
      const cellCenterX = cellX + colWidth / 2;
      const cellCenterY = cellY + rowHeight / 2;
      
      // Only draw day number if this cell should have a day
      if ((week === 0 && dow >= firstDayOfWeek) || 
          (week > 0 && dayCounter <= daysInMonth)) {
        
        if (dayCounter <= daysInMonth) {
          // Draw cell border
          await miro.board.createShape({
            shape: 'rectangle',
            x: cellCenterX,
            y: cellCenterY,
            width: colWidth - 4,
            height: rowHeight - 4,
            style: {
              borderColor: isWeekend ? '#ffebee' : '#e0e0e0',
              borderWidth: 1,
              fillColor: isWeekend ? '#fafafa' : '#ffffff',
            },
          });
          
          // Day number in top-left corner of cell
          await miro.board.createText({
            content: `${dayCounter}`,
            x: cellX + 25,
            y: cellY + 20,
            width: 40,
            style: {
              fontSize: 14,
              fontFamily: 'arial',
              color: isWeekend ? '#d32f2f' : '#424242',
              textAlign: 'center',
              fillColor: 'transparent',
            },
          });
          
          // Divider line between team tasks (left) and personal schedules (right)
          const dividerX = cellCenterX;
          await miro.board.createShape({
            shape: 'rectangle',
            x: dividerX,
            y: cellCenterY,
            width: 1,
            height: rowHeight - 8,
            style: {
              borderWidth: 0,
              fillColor: '#bdbdbd',
            },
          });
          
          dayCounter++;
        }
      }
    }
  }
}

// Move viewport to a specific month's calendar frame
export async function moveToMonth(yearMonth: string): Promise<void> {
  const frames = await miro.board.get({ type: 'frame' });
  const targetFrame = frames.find((frame: any) => frame.title === `Calendar ${yearMonth}`);
  
  if (targetFrame) {
    await miro.board.viewport.zoomTo(targetFrame);
  }
}

// Navigate to previous month
export async function navigateToPreviousMonth(settings: Settings): Promise<Settings> {
  const baseDate = new Date(settings.baseMonth + '-01');
  baseDate.setMonth(baseDate.getMonth() - 1);
  const newSettings = {
    ...settings,
    baseMonth: baseDate.toISOString().substring(0, 7),
  };
  
  await generateCalendar(newSettings);
  await moveToMonth(newSettings.baseMonth);
  
  return newSettings;
}

// Navigate to next month
export async function navigateToNextMonth(settings: Settings): Promise<Settings> {
  const baseDate = new Date(settings.baseMonth + '-01');
  baseDate.setMonth(baseDate.getMonth() + 1);
  const newSettings = {
    ...settings,
    baseMonth: baseDate.toISOString().substring(0, 7),
  };
  
  await generateCalendar(newSettings);
  await moveToMonth(newSettings.baseMonth);
  
  return newSettings;
}

// Calculate position for a task on the calendar
export function calculateTaskPosition(
  task: Task, 
  settings: Settings,
  isPersonalSchedule: boolean = false
): { x: number, y: number } {
  if (!task.date) return { x: 0, y: 0 };

  const taskDate = new Date(task.date);
  const baseDate = new Date(settings.baseMonth + '-01');
  
  // Calculate month difference to determine which frame
  const diffYear = taskDate.getFullYear() - baseDate.getFullYear();
  const diffMonth = diffYear * 12 + taskDate.getMonth() - baseDate.getMonth();
  
  // Frame constants (must match generateCalendar)
  const frameWidth = 2800;
  const frameHeight = 2400;
  const frameSpacing = 300;
  const startX = 0;
  const startY = 0;
  
  const frameX = startX + diffMonth * (frameWidth + frameSpacing);
  const frameY = startY;
  
  // Calculate position within the monthly calendar grid
  const year = taskDate.getFullYear();
  const month = taskDate.getMonth();
  const day = taskDate.getDate();
  
  // Find which week and day of week this date is
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysSinceFirstOfMonth = day - 1;
  const totalDayOffset = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(totalDayOffset / 7);
  const dayOfWeek = totalDayOffset % 7;
  
  // Calendar layout constants (must match createMonthlyCalendarGrid)
  const headerHeight = 80;
  const dayOfWeekHeaderHeight = 40;
  const colWidth = frameWidth / 7;
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Calculate cell position
  const cellX = frameX - frameWidth / 2 + colWidth * dayOfWeek;
  const cellY = contentStartY + rowHeight * weekRow;
  
  // Position within the cell
  // Left half for team tasks, right half for personal schedules
  const cellCenterX = cellX + colWidth / 2;
  const cellCenterY = cellY + rowHeight / 2;
  
  // Offset from center based on whether it's a team task or personal schedule
  const horizontalOffset = isPersonalSchedule ? colWidth / 4 : -colWidth / 4;
  
  // Calculate vertical position based on time if available
  let verticalOffset = 0;
  if (task.time && task.time.startTime) {
    const [hours, minutes] = task.time.startTime.split(':').map(Number);
    const timeInMinutes = hours * 60 + minutes;
    // Map 9:00-18:00 (540-1080 minutes) to position within cell
    const workDayStart = 9 * 60; // 9:00
    const workDayEnd = 18 * 60; // 18:00
    const workDayRange = workDayEnd - workDayStart;
    
    if (timeInMinutes >= workDayStart && timeInMinutes <= workDayEnd) {
      const normalizedTime = (timeInMinutes - workDayStart) / workDayRange;
      // Use about 60% of cell height for time-based positioning, leaving room at top for day number
      const usableHeight = rowHeight * 0.6;
      verticalOffset = (normalizedTime - 0.5) * usableHeight + 30; // +30 to leave room for day number
    }
  }
  
  return { 
    x: cellCenterX + horizontalOffset,
    y: cellCenterY + verticalOffset
  };
}
