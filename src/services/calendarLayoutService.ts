import { miro } from '../miro';
import { Settings, Task } from '../models/types';
import { withRetry } from '../utils/retry';

// Calendar layout constants
const CALENDAR_FRAME_WIDTH = 4200; // 6 columns * 700px (Mon-Fri + Weekly)
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
  const colWidth = frameWidth / 6; // 6 columns (Mon-Fri + Weekly)
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
  
  // Day of week headers (Mon, Tue, Wed, Thu, Fri, Weekly)
  const daysOfWeek = ['月', '火', '水', '木', '金', 'Weekly'];
  
  // Parallelize header creation
  const headerPromises = Array.from({ length: 6 }, async (_, dow) => {
    const x = frameX - frameWidth / 2 + colWidth * (dow + 0.5);
    const y = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight / 2;
    const isWeekly = dow === 5;
    
    const header = await withRetry(() => miro.board.createText({
      content: daysOfWeek[dow],
      x,
      y,
      width: colWidth - 20,
      style: {
        fontSize: 32,
        fontFamily: 'arial',
        color: '#424242',
        textAlign: 'center',
        fillColor: isWeekly ? '#fff9c4' : 'transparent', // Weekly header is yellow
      },
    }));
    return header;
  });

  const headers = await Promise.all(headerPromises);

  // Add headers to frame sequentially
  for (const header of headers) {
    await withRetry(() => frame.add(header));
  }
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;

  // Draw Grid Lines (Long lines to reduce shape count)
  const gridLines = [];

  // Vertical Lines (7 lines for 6 columns)
  for (let i = 0; i <= 6; i++) {
      const x = frameX - frameWidth / 2 + colWidth * i;
      // Center of the line
      const lineX = x; 
      const lineY = contentStartY + (numWeeks * rowHeight) / 2;
      
      const line = await withRetry(() => miro.board.createShape({
          shape: 'rectangle',
          x: lineX,
          y: lineY,
          width: 8, // Minimum allowed width is 8
          height: numWeeks * rowHeight,
          style: {
              fillColor: '#e0e0e0', // Lighter color for thicker line
              borderWidth: 0
          }
      }));
      gridLines.push(line);
  }

  // Horizontal Lines (7 lines for 6 rows)
  for (let i = 0; i <= numWeeks; i++) {
      const y = contentStartY + rowHeight * i;
      // Center of the line
      const lineY = y;
      const lineX = frameX;
      
      const line = await withRetry(() => miro.board.createShape({
          shape: 'rectangle',
          x: lineX,
          y: lineY,
          width: frameWidth,
          height: 8, // Minimum allowed size is 8
          style: {
              fillColor: '#e0e0e0', // Lighter color for thicker line
              borderWidth: 0
          }
      }));
      gridLines.push(line);
  }

  // Add lines to frame
  for (const line of gridLines) {
      await withRetry(() => frame.add(line));
  }
  
  // Draw day numbers
  const firstDay = new Date(year, month, 1);
  // Adjust firstDayOfWeek to Mon=0, Sun=6
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; 
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Process days
  for (let day = 1; day <= daysInMonth; day++) {
      const absoluteCol = firstDayOfWeek + (day - 1);
      const row = Math.floor(absoluteCol / 7);
      const col = absoluteCol % 7;

      // Skip Sat(5) and Sun(6)
      if (col >= 5) continue;

      // Calculate position
      const cellX = frameX - frameWidth / 2 + colWidth * col;
      const cellY = contentStartY + rowHeight * row;
      
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      // Create Day Number Button
      const dayButton = await withRetry<any>(() => miro.board.createShape({
            shape: 'round_rectangle',
            content: `<p><strong>${day}</strong></p>`,
            x: cellX + 50,
            y: cellY + 40,
            width: 60,
            height: 60,
            style: {
            fillColor: '#f5f5f5',
            borderColor: '#bdbdbd',
            borderWidth: 2,
            fontSize: 24,
            fontFamily: 'arial',
            color: '#424242',
            textAlign: 'center',
            textAlignVertical: 'middle',
            },
        }));
        await withRetry(() => dayButton.setMetadata('appType', 'calendarCell'));
        await withRetry(() => dayButton.setMetadata('date', dateStr));
        await withRetry(() => dayButton.setMetadata('isDayNumber', true));
        
        await withRetry(() => frame.add(dayButton));
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
  const colWidth = frameWidth / 6; // 6 columns
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
  
  const firstDay = new Date(year, month, 1);
  // Adjust firstDayOfWeek to Mon=0, Sun=6
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysSinceFirstOfMonth = day - 1;
  const absoluteCol = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(absoluteCol / 7);
  const dayOfWeek = absoluteCol % 7;
  
  // If weekend, skip (or handle gracefully)
  if (dayOfWeek >= 5) {
      console.warn(`Task on weekend ${date} cannot be placed in grid.`);
      return new Map();
  }

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
  // Adjust firstDayOfWeek to Mon=0, Sun=6
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysSinceFirstOfMonth = day - 1;
  const absoluteCol = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(absoluteCol / 7);
  const dayOfWeek = absoluteCol % 7;
  
  // Calendar layout constants (must match createMonthlyCalendarGrid)
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 6; // 6 columns
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
  // Adjust firstDayOfWeek to Mon=0, Sun=6
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysSinceFirstOfMonth = day - 1;
  const absoluteCol = firstDayOfWeek + daysSinceFirstOfMonth;
  
  const weekRow = Math.floor(absoluteCol / 7);
  const dayOfWeek = absoluteCol % 7;
  
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 6; // 6 columns
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
export async function getDateFromPosition(x: number, y: number, item?: any, knownFrame?: any): Promise<string | null> {
  // 1. Find intersecting frame
  // We need to find which calendar frame the point belongs to
  let frame: any = knownFrame || null;

  // Strategy A: Check parentId (most reliable if item is attached to frame)
  if (!frame && item && item.parentId) {
      try {
          const parent = await withRetry<any[]>(() => miro.board.get({ id: item.parentId }), undefined, 'board.get(parentId)');
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
      const frames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }), undefined, 'board.get(frame)');
      
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

  // Strategy C: Math-based Calculation (Primary)
  // We prioritize this over hit-testing because hit-testing requires fetching children (expensive/unreliable)
  // while math only requires the frame (cheap/reliable).
  try {
      // 2. Parse Year/Month from title
      const match = frame.title.match(/Calendar (\d{4})-(\d{2})/);
      if (match) {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // 0-indexed
          
          // 3. Determine Day within Frame
          // Use actual frame dimensions to handle resized frames
          const frameWidth = frame.width;
          const frameHeight = frame.height;
          
          // Use proportional heights to handle resized frames correctly
          // Original design: 4800px height, 160px header, 80px day header
          const ORIGINAL_HEIGHT = 4800;
          const headerHeight = frameHeight * (160 / ORIGINAL_HEIGHT);
          const dayOfWeekHeaderHeight = frameHeight * (80 / ORIGINAL_HEIGHT);
          
          // Determine columns based on width (Standard col width is 700)
          // Old frames (5600) have 8 cols. New frames (4200) have 6 cols.
          const STANDARD_COL_WIDTH = 700;
          const numCols = Math.round(frameWidth / STANDARD_COL_WIDTH);
          const colWidth = frameWidth / numCols;
          
          const numWeeks = 6;
          const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
          
          const contentStartY = frame.y - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
          
          // Relative position in grid area
          const relX = x - (frame.x - frameWidth / 2);
          const relY = y - contentStartY;
          
          if (relX >= 0 && relX <= frameWidth && relY >= 0 && relY <= numWeeks * rowHeight) {
              const col = Math.floor(relX / colWidth);
              const row = Math.floor(relY / rowHeight);
              
              // Handle Weekly column (last column)
              if (col === numCols - 1) {
                  console.log('Dropped in Weekly column - ignoring for now');
                  return null;
              }

              // Calculate Date
              const firstDay = new Date(year, month, 1);
              
              // Adjust firstDayOfWeek logic based on layout
              // If 8 cols (Old): Sun(0)..Sat(6), Weekly(7). firstDayOfWeek is standard (Sun=0).
              // If 6 cols (New): Mon(0)..Fri(4), Weekly(5). firstDayOfWeek needs adjustment (Mon=0).
              
              let dayIndex = -1;
              
              if (numCols === 8) {
                  // Old Layout: Sun, Mon, Tue, Wed, Thu, Fri, Sat, Weekly
                  const firstDayOfWeek = firstDay.getDay(); // Sun=0
                  // absoluteCol = row * 7 + col? No, row * 7 is for 7-day weeks.
                  // But the grid has 8 columns.
                  // Actually old logic was: dayIndex = row * 7 + col - firstDayOfWeek + 1
                  // And it skipped col 7 (Weekly).
                  if (col < 7) {
                      dayIndex = row * 7 + col - firstDayOfWeek + 1;
                  }
              } else {
                  // New Layout: Mon, Tue, Wed, Thu, Fri, Weekly
                  // Skips Sat/Sun.
                  // Mon=0, Sun=6.
                  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; 
                  
                  // absoluteCol = row * 7 + col?
                  // No, we need to map grid col (0-4) to absolute day offset.
                  // Grid Col 0 = Mon.
                  // If first day is Wed (2), then absolute col of 1st is 2.
                  // Grid Col 0 (Mon) of that week is absolute col 0.
                  
                  // absoluteCol = row * 7 + col
                  const absoluteCol = row * 7 + col;
                  dayIndex = absoluteCol - firstDayOfWeek + 1;
              }

              const daysInMonth = new Date(year, month + 1, 0).getDate();
              
              if (dayIndex >= 1 && dayIndex <= daysInMonth) {
                  const mStr = (month + 1).toString().padStart(2, '0');
                  const dStr = dayIndex.toString().padStart(2, '0');
                  const dateStr = `${year}-${mStr}-${dStr}`;
                  console.log(`Found date via Math Calculation: ${dateStr} (row=${row}, col=${col})`);
                  return dateStr;
              } else {
                  console.log(`Math calculated dayIndex ${dayIndex} which is out of range (1-${daysInMonth})`);
              }
          }
      }
  } catch (e) {
      console.warn('Error performing math calculation for date:', e);
  }

  // Strategy D: Hit Testing (Fallback)
  // Only use this if math failed (e.g. weird frame title or layout)
  try {
      console.log('Math strategy failed or returned no date, trying Hit Testing...');
      const children = await withRetry<any[]>(() => frame.getChildren(), undefined, 'frame.getChildren');
      // Filter for shapes (cells) that contain the point
      const candidates = children.filter((c: any) => {
          if (c.type !== 'shape') return false;
          const left = c.x - c.width / 2;
          const right = c.x + c.width / 2;
          const top = c.y - c.height / 2;
          const bottom = c.y + c.height / 2;
          return x >= left && x <= right && y >= top && y <= bottom;
      });

      for (const cell of candidates) {
          try {
              const appType = await withRetry(() => cell.getMetadata('appType'), undefined, 'cell.getMetadata(appType)');
              if (appType === 'calendarCell') {
                  const date = await withRetry(() => cell.getMetadata('date'), undefined, 'cell.getMetadata(date)');
                  if (date) {
                      console.log(`Found calendar cell via hit-testing at (${x}, ${y}) with date ${date}`);
                      return date as string;
                  }
              }
          } catch (e) {
              // ignore metadata errors
          }
      }
  } catch (e) {
      console.warn('Error performing hit testing for calendar cells:', e);
  }
  
  return null;
}
