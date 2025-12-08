import { miro } from '../miro';
import { Settings, Task } from '../models/types';
import { withRetry } from '../utils/retry';

// Calendar layout constants
const CALENDAR_FRAME_WIDTH = 5600;
const CALENDAR_FRAME_HEIGHT = 4800;
const CALENDAR_FRAME_SPACING = 600;
const CALENDAR_EPOCH_YEAR = 2024; // Fixed reference year for coordinate system

// Generate a single month calendar frame on the board
export async function generateCalendar(yearMonth: string, settings: Settings): Promise<void> {
  const monthDate = new Date(yearMonth + '-01');
  
  // New larger dimensions for monthly calendar layout
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  const frameSpacing = CALENDAR_FRAME_SPACING;
  const startX = 0;
  const startY = 0;
  
  const monthStr = yearMonth; // YYYY-MM
  
  // Check if frame already exists
  const existingFrames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
  const frameExists = existingFrames.some(
    (frame: any) => frame.title === `Calendar ${monthStr}`
  );
  
  if (frameExists) {
    console.warn(`Calendar for ${monthStr} already exists.`);
    await moveToMonth(monthStr);
    return;
  }

  // Calculate position based on fixed epoch to ensure consistent positioning
  // regardless of settings.baseMonth
  const diffYear = monthDate.getFullYear() - CALENDAR_EPOCH_YEAR;
  const diffMonth = diffYear * 12 + monthDate.getMonth(); // month is 0-11
  
  const x = startX + diffMonth * (frameWidth + frameSpacing);
  const y = startY;
  
  const frame = await withRetry(() => miro.board.createFrame({
    title: `Calendar ${monthStr}`,
    x,
    y,
    width: frameWidth,
    height: frameHeight,
    style: {
      fillColor: '#ffffff',
    },
  }));
  
  // Add monthly calendar structure within the frame
  await createMonthlyCalendarGrid(frame, monthDate, settings);
  
  // Move viewport to the new calendar
  await moveToMonth(monthStr);
  
  // Explicitly zoom to the new frame to ensure user sees it
  try {
      await miro.board.viewport.zoomTo(frame);
  } catch (e) {
      console.error('Failed to zoom to frame:', e);
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
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 8; // 8 columns (7 days + Weekly)
  const numWeeks = 6; // Max weeks in a month
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  // Month title
  const monthNameJa = ['1月', '2月', '3月', '4月', '5月', '6月',
                       '7月', '8月', '9月', '10月', '11月', '12月'];
  
  const title = await withRetry(() => miro.board.createText({
    content: `${year}年 ${monthNameJa[month]}`,
    x: frameX,
    y: frameY - frameHeight / 2 + headerHeight / 2,
    width: frameWidth - 80,
    style: {
      fontSize: 48,
      fontFamily: 'arial',
      color: '#1a1a1a',
      textAlign: 'center',
      fillColor: 'transparent',
    },
  }));
  await withRetry(() => frame.add(title));
  
  // Day of week headers (Sun, Mon, Tue, Wed, Thu, Fri, Sat, Weekly)
  const daysOfWeek = ['日', '月', '火', '水', '木', '金', '土', 'Weekly'];
  const weekendDays = [0, 6]; // Sunday and Saturday
  
  for (let dow = 0; dow < 8; dow++) {
    const x = frameX - frameWidth / 2 + colWidth * (dow + 0.5);
    const y = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight / 2;
    const isWeekend = weekendDays.includes(dow);
    const isWeekly = dow === 7;
    
    const header = await withRetry(() => miro.board.createText({
      content: daysOfWeek[dow],
      x,
      y,
      width: colWidth - 20,
      style: {
        fontSize: 32,
        fontFamily: 'arial',
        color: isWeekend ? '#d32f2f' : '#424242',
        textAlign: 'center',
        fillColor: isWeekly ? '#fff9c4' : 'transparent', // Weekly header is yellow
      },
    }));
    await withRetry(() => frame.add(header));
  }
  
  // Draw grid lines and day numbers
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Draw cells for each day
  let dayCounter = 1;
  for (let week = 0; week < numWeeks; week++) {
    for (let dow = 0; dow < 8; dow++) {
      const cellX = frameX - frameWidth / 2 + colWidth * dow;
      const cellY = contentStartY + rowHeight * week;
      const isWeekend = weekendDays.includes(dow);
      const isWeekly = dow === 7;
      
      // Draw cell background
      const cellCenterX = cellX + colWidth / 2;
      const cellCenterY = cellY + rowHeight / 2;
      
      if (isWeekly) {
        // Draw Weekly cell (just a box, no date)
        const cellShape = await withRetry<any>(() => miro.board.createShape({
          shape: 'rectangle',
          x: cellCenterX,
          y: cellCenterY,
          width: colWidth,
          height: rowHeight,
          style: {
            borderColor: '#424242',
            borderWidth: 4,
            fillColor: '#ffffff',
          },
        }));
        await withRetry(() => frame.add(cellShape));
        continue;
      }

      // Only draw day number if this cell should have a day
      if ((week === 0 && dow >= firstDayOfWeek) || 
          (week > 0 && dayCounter <= daysInMonth)) {
        
        if (dayCounter <= daysInMonth) {
          // Draw cell border (continuous grid)
          const cellShape = await withRetry<any>(() => miro.board.createShape({
            shape: 'rectangle',
            x: cellCenterX,
            y: cellCenterY,
            width: colWidth,
            height: rowHeight,
            style: {
              borderColor: isWeekend ? '#ef9a9a' : '#424242', // Darker border
              borderWidth: 4, // Thicker border
              fillColor: isWeekend ? '#fafafa' : '#ffffff',
            },
          }));
          
          // Set metadata for click detection
          const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayCounter.toString().padStart(2, '0')}`;
          await withRetry(() => cellShape.setMetadata('appType', 'calendarCell'));
          await withRetry(() => cellShape.setMetadata('date', dateStr));
          
          await withRetry(() => frame.add(cellShape));
          
          // Day number button
          const dayButton = await withRetry<any>(() => miro.board.createShape({
            shape: 'round_rectangle',
            content: `<p><strong>${dayCounter}</strong></p>`,
            x: cellX + 50,
            y: cellY + 40,
            width: 60,
            height: 60,
            style: {
              fillColor: '#f5f5f5', // Light gray background
              borderColor: isWeekend ? '#ef9a9a' : '#bdbdbd',
              borderWidth: 2,
              fontSize: 24,
              fontFamily: 'arial',
              color: isWeekend ? '#d32f2f' : '#424242',
              textAlign: 'center',
              textAlignVertical: 'middle',
            },
          }));
          
          // Set metadata for click detection
          await withRetry(() => dayButton.setMetadata('appType', 'calendarCell'));
          await withRetry(() => dayButton.setMetadata('date', dateStr));
          
          await withRetry(() => frame.add(dayButton));
          
          // Divider line between team tasks (left) and personal schedules (right)
          const dividerX = cellCenterX;
          const divider = await withRetry(() => miro.board.createShape({
            shape: 'rectangle',
            x: dividerX,
            y: cellCenterY,
            width: 8, // Minimum allowed width
            height: rowHeight - 16,
            style: {
              borderWidth: 0,
              fillColor: '#e0e0e0',
            },
          }));
          await withRetry(() => frame.add(divider));
          
          dayCounter++;
        }
      }
    }
  }
}

// Move viewport to a specific month's calendar frame
export async function moveToMonth(yearMonth: string): Promise<void> {
  const frames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
  const targetFrame = frames.find((frame: any) => frame.title === `Calendar ${yearMonth}`);
  
  if (targetFrame) {
    await withRetry(() => miro.board.viewport.zoomTo(targetFrame));
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
  
  await generateCalendar(newSettings.baseMonth, newSettings);
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
  
  await generateCalendar(newSettings.baseMonth, newSettings);
  await moveToMonth(newSettings.baseMonth);
  
  return newSettings;
}

// Helper to find frame
export async function getCalendarFrame(year: number, month: number): Promise<any> {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const frames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
  return frames.find((f: any) => f.title === `Calendar ${monthStr}`);
}

export async function calculateTaskPositionsForDate(
  date: string,
  tasks: Task[]
): Promise<Map<string, { x: number, y: number }>> {
  // Parse date string manually to avoid timezone issues
  const [y, m, d] = date.split('-').map(Number);
  const year = y;
  const month = m - 1; // 0-indexed
  const day = d;

  // 1. Find Frame
  let frame = await getCalendarFrame(year, month);
  
  let frameX = 0;
  let frameY = 0;
  
  if (frame) {
    frameX = frame.x;
    frameY = frame.y;
  } else {
    console.warn(`Frame for ${date} not found.`);
    return new Map();
  }

  // 2. Calculate Cell Position
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 8;
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysSinceFirstOfMonth = day - 1;
  const totalDayOffset = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(totalDayOffset / 7);
  const dayOfWeek = totalDayOffset % 7;
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  const cellX = frameX - frameWidth / 2 + colWidth * dayOfWeek;
  const cellY = contentStartY + rowHeight * weekRow;
  
  // 3. Sort Tasks
  // Sort by time (asc), then untimed tasks at the end
  const sortedTasks = [...tasks].sort((a, b) => {
    const timeA = a.time?.startTime || '99:99';
    const timeB = b.time?.startTime || '99:99';
    return timeA.localeCompare(timeB);
  });
  
  // 4. Stack Layout (5x5 Grid)
  const positions = new Map<string, { x: number, y: number }>();
  // const MAX_COLS = 5;
  const ITEM_WIDTH = 140;
  const ITEM_HEIGHT = 140; // Assumed height
  const GAP = 10;
  
  // Start from top-left of the cell, below the day number
  // cellX is left edge, cellY is top edge
  const startX = cellX + GAP + ITEM_WIDTH / 2;
  const startY = cellY + 80 + GAP + ITEM_HEIGHT / 2; // Skip day number area (approx 80px)
  
  // Divider logic:
  // The cell is divided into Left (Team) and Right (Personal)
  // The divider is at cellX + colWidth / 2
  // Left area: cellX to cellX + colWidth/2
  // Right area: cellX + colWidth/2 to cellX + colWidth
  
  // Calculate how many columns fit in the Left side (Team area)
  const halfWidth = colWidth / 2;
  const colsPerSide = Math.floor((halfWidth - GAP) / (ITEM_WIDTH + GAP)); // e.g. 2
  
  // Use colsPerSide as the max columns to ensure tasks stay on the left side
  // This effectively makes the layout "Top-Left to Down" (wrapping to next row sooner)
  // instead of crossing the divider.
  const effectiveMaxCols = Math.max(1, colsPerSide);
  
  sortedTasks.forEach((task, index) => {
    const col = index % effectiveMaxCols;
    const row = Math.floor(index / effectiveMaxCols);
    
    const x = startX + col * (ITEM_WIDTH + GAP);
    const y = startY + row * (ITEM_HEIGHT + GAP);
    
    positions.set(task.id, { x, y });
  });
  
  return positions;
}

// Calculate position for a task on the calendar
export async function calculateTaskPosition(
  task: Task, 
  _settings: Settings,
  _isPersonalSchedule: boolean = false
): Promise<{ x: number, y: number }> {
  if (!task.date) return { x: 0, y: 0 };

  const taskDate = new Date(task.date);
  const year = taskDate.getFullYear();
  const month = taskDate.getMonth();
  const day = taskDate.getDate();

  // Try to find the actual frame on the board first
  let frameX = 0;
  let frameY = 0;
  const frame = await getCalendarFrame(year, month);

  if (frame) {
    frameX = frame.x;
    frameY = frame.y;
  } else {
    // Fallback to calculation based on fixed epoch
    // Calculate month difference to determine which frame
    const diffYear = taskDate.getFullYear() - CALENDAR_EPOCH_YEAR;
    const diffMonth = diffYear * 12 + taskDate.getMonth();
    
    // Frame constants (must match generateCalendar)
    const frameWidth = CALENDAR_FRAME_WIDTH;
    const frameSpacing = CALENDAR_FRAME_SPACING;
    const startX = 0;
    const startY = 0;
    
    frameX = startX + diffMonth * (frameWidth + frameSpacing);
    frameY = startY;
  }
  
  // Frame constants
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  
  // Calculate position within the monthly calendar grid
  
  // Find which week and day of week this date is
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysSinceFirstOfMonth = day - 1;
  const totalDayOffset = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(totalDayOffset / 7);
  const dayOfWeek = totalDayOffset % 7;
  
  // Calendar layout constants (must match createMonthlyCalendarGrid)
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 8;
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Calculate cell position
  const cellX = frameX - frameWidth / 2 + colWidth * dayOfWeek;
  const cellY = contentStartY + rowHeight * weekRow;
  
  // Position within the cell
  // Default to first slot in 5x5 grid
  const ITEM_WIDTH = 140;
  const ITEM_HEIGHT = 140;
  const GAP = 10;
  
  // For initial placement, just put it in the first slot or calculate based on time if needed
  // But since we have reorganizeTasksOnDate, this initial position might be temporary.
  // However, let's try to respect the grid logic even here.
  
  const startGridX = cellX + GAP + ITEM_WIDTH / 2;
  const startGridY = cellY + 80 + GAP + ITEM_HEIGHT / 2;
  
  return { 
    x: startGridX,
    y: startGridY
  };
}

// Calculate position for a personal schedule note
export const PERSONAL_NOTE_WIDTH = 180;

export async function calculatePersonalSchedulePosition(
  dateStr: string, 
  index: number
): Promise<{ x: number, y: number }> {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Try to find the actual frame on the board first
  let frameX = 0;
  let frameY = 0;
  const frame = await getCalendarFrame(year, month);

  if (frame) {
    frameX = frame.x;
    frameY = frame.y;
  } else {
    // Fallback to calculation based on fixed epoch
    const diffYear = date.getFullYear() - CALENDAR_EPOCH_YEAR;
    const diffMonth = diffYear * 12 + date.getMonth();
    
    const frameWidth = CALENDAR_FRAME_WIDTH;
    const frameSpacing = CALENDAR_FRAME_SPACING;
    const startX = 0;
    const startY = 0;
    
    frameX = startX + diffMonth * (frameWidth + frameSpacing);
    frameY = startY;
  }
  
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysSinceFirstOfMonth = day - 1;
  const totalDayOffset = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(totalDayOffset / 7);
  const dayOfWeek = totalDayOffset % 7;
  
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 8;
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  const cellX = frameX - frameWidth / 2 + colWidth * dayOfWeek;
  const cellY = contentStartY + rowHeight * weekRow;
  
  // Personal area is the right half of the cell
  const cellCenterX = cellX + colWidth / 2;
  
  // 2 columns layout
  const COLUMNS = 2;
  const GAP = 10;
  // const NOTE_WIDTH = 180; // Defined as constant
  const NOTE_HEIGHT = 110; // Stride height
  
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  
  // Calculate x position for the column
  // Start from cellCenterX
  const startX = cellCenterX + GAP + PERSONAL_NOTE_WIDTH / 2;
  const x = startX + col * (PERSONAL_NOTE_WIDTH + GAP);
  
  const startYPos = cellY + 40; // Header offset
  const y = startYPos + row * (NOTE_HEIGHT + GAP) + NOTE_HEIGHT / 2;
  
  return { x, y };
}

// Calculate date from board position (x, y)
export async function getDateFromPosition(x: number, y: number, item?: any): Promise<string | null> {
  // 1. Find intersecting frame
  // We need to find which calendar frame the point belongs to
  let frame: any = null;

  // Strategy A: Check parentId (most reliable if item is attached to frame)
  if (item && item.parentId) {
      try {
          const parent = await withRetry<any[]>(() => miro.board.get({ id: item.parentId }));
          if (parent && parent.length > 0 && parent[0].type === 'frame') {
              console.log(`Found parent frame via parentId: ${parent[0].title}`);
              if (parent[0].title.startsWith('Calendar ')) {
                  frame = parent[0];
              }
          }
      } catch (e) {
          console.warn('Error fetching parent frame:', e);
      }
  }

  // Strategy B: Spatial Search (if not found via parentId)
  if (!frame) {
      const frames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
      
      // Debug: Log all frames found
      console.log(`getDateFromPosition: Checking ${frames.length} frames for point (${x}, ${y})`);
      
      frame = frames.find((f: any) => {
        const left = f.x - f.width / 2;
        const right = f.x + f.width / 2;
        const top = f.y - f.height / 2;
        const bottom = f.y + f.height / 2;
        
        const isInside = x >= left && x <= right && y >= top && y <= bottom;
        if (isInside) {
            console.log(`Found frame match: ${f.title} [${left}, ${right}, ${top}, ${bottom}]`);
        }
        return isInside && f.title.startsWith('Calendar ');
      });
      
      if (!frame) {
        console.log('getDateFromPosition: No calendar frame found at', x, y);
        // Log bounds of first few frames for debugging
        frames.slice(0, 3).forEach((f: any) => {
            console.log(`Frame: ${f.title}, x:${f.x}, y:${f.y}, w:${f.width}, h:${f.height}`);
        });
        return null;
      }
  }
  
  // 2. Parse Year/Month from title
  const match = frame.title.match(/Calendar (\d{4})-(\d{2})/);
  if (!match) {
    console.log('getDateFromPosition: Invalid frame title', frame.title);
    return null;
  }
  
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1; // 0-indexed
  
  // 3. Determine Day within Frame
  // We use constants for layout to ensure we match the generation logic
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 7;
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const contentStartY = frame.y - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Relative position in grid area
  // Note: If item is child of frame, x/y might be relative? 
  // Miro SDK v2 usually returns absolute coordinates even for children.
  // But let's verify if we need to adjust.
  
  let calcX = x;
  let calcY = y;
  
  // Determine if coordinates are relative
  let isRelative = false;
  
  // 1. Explicit check: If item is child of this frame
  if (item && item.parentId === frame.id) {
      isRelative = true;
      console.log('Item is child of frame. Using relative coordinates.');
  } 
  // 2. Heuristic check: If coordinates are "small" relative to frame position
  // (e.g. x is 500, but frame.x is 140000)
  // If the point is NOT inside the frame's absolute bounds, it's likely relative.
  else {
      const left = frame.x - frameWidth / 2;
      const right = frame.x + frameWidth / 2;
      const top = frame.y - frameHeight / 2;
      const bottom = frame.y + frameHeight / 2;
      
      const isInsideAbsolute = x >= left && x <= right && y >= top && y <= bottom;
      
      if (!isInsideAbsolute) {
           // Double check: is it "far" away?
           if (Math.abs(x - frame.x) > frameWidth) {
               isRelative = true;
               console.log('Coordinates are far from frame center. Assuming relative coordinates.');
           }
      }
  }

  if (isRelative) {
      // Miro SDK v2: Items inside frames use coordinates relative to the frame's top-left corner
      calcX = (frame.x - frameWidth / 2) + x;
      calcY = (frame.y - frameHeight / 2) + y;
      
      console.log(`Converted relative (${x}, ${y}) to absolute (${calcX}, ${calcY})`);
  }

  const relX = calcX - (frame.x - frameWidth / 2);
  const relY = calcY - contentStartY;
  
  if (relX < 0 || relX > frameWidth || relY < 0 || relY > numWeeks * rowHeight) {
    console.log('getDateFromPosition: Point outside grid area', relX, relY);
    return null;
  }
  
  const col = Math.floor(relX / colWidth);
  const row = Math.floor(relY / rowHeight);
  
  // Calculate Date
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  
  // dayIndex = row * 7 + col - firstDayOfWeek + 1
  const dayIndex = row * 7 + col - firstDayOfWeek + 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  if (dayIndex >= 1 && dayIndex <= daysInMonth) {
    const mStr = (month + 1).toString().padStart(2, '0');
    const dStr = dayIndex.toString().padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  }
  
  console.log('getDateFromPosition: Invalid day index', dayIndex);
  return null;
}
