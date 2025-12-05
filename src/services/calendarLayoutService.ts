import { miro } from '../miro';
import { Settings } from '../models/types';

const CALENDAR_FRAME_TAG = 'agile-calendar-frame';

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
  
  const frameWidth = 2000;
  const frameHeight = 1500;
  const frameSpacing = 200;
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
          fillColor: '#f5f5f5',
        },
      });
      
      // Tag it as calendar frame
      const currentTags = frame.tags || [];
      frame.tags = [...currentTags, CALENDAR_FRAME_TAG];
      await frame.sync();
      
      // Add basic calendar structure within the frame
      await createCalendarGrid(frame, monthDate, settings);
    }
  }
}

// Create the calendar grid inside a frame
async function createCalendarGrid(
  frame: any,
  monthDate: Date,
  settings: Settings
): Promise<void> {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const frameX = frame.x;
  const frameY = frame.y;
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  
  // Calculate grid dimensions
  const headerHeight = 100;
  const rowHeight = (frameHeight - headerHeight) / (settings.tracks.filter(t => t.active).length + 3); // PM, Designer, Tracks
  const colWidth = frameWidth / daysInMonth;
  
  // Create header row with dates
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const x = frameX - frameWidth / 2 + colWidth * (day - 0.5);
    const y = frameY - frameHeight / 2 + headerHeight / 2;
    
    await miro.board.createText({
      content: `${day}`,
      x,
      y,
      width: colWidth - 10,
      style: {
        fontSize: 14,
        color: isWeekend ? '#999999' : '#000000',
        textAlign: 'center',
      },
    });
  }
  
  // Create row labels (PM, Designer, Tracks)
  const rows = ['PM', 'Designer', ...settings.tracks.filter(t => t.active).map(t => t.name)];
  
  for (let i = 0; i < rows.length; i++) {
    const x = frameX - frameWidth / 2 + 80;
    const y = frameY - frameHeight / 2 + headerHeight + rowHeight * (i + 0.5);
    
    await miro.board.createText({
      content: rows[i],
      x,
      y,
      width: 150,
      style: {
        fontSize: 12,
        textAlign: 'left',
      },
    });
  }
}

// Move viewport to a specific month's calendar frame
export async function moveToMonth(yearMonth: string): Promise<void> {
  const frames = await miro.board.get({ type: 'frame', tags: [CALENDAR_FRAME_TAG] });
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
