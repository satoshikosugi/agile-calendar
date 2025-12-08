import { miro } from '../miro';
import { Settings, Task } from '../models/types';
import { withRetry } from '../utils/retry';

// カレンダーレイアウトの定数
const CALENDAR_FRAME_WIDTH = 5600;
const CALENDAR_FRAME_HEIGHT = 4800;
const CALENDAR_FRAME_SPACING = 600;
const CALENDAR_EPOCH_YEAR = 2024; // 座標系の固定基準年

// フレームキャッシュ（API呼び出しを削減）
const frameCache = new Map<string, { frame: any, timestamp: number }>();
const FRAME_CACHE_TTL = 5000; // 5秒間キャッシュ

// ボード上に単一月のカレンダーフレームを生成
export async function generateCalendar(yearMonth: string, settings: Settings): Promise<void> {
  const monthDate = new Date(yearMonth + '-01');
  
  // 月間カレンダーレイアウトのための新しい大きなサイズ
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  const frameSpacing = CALENDAR_FRAME_SPACING;
  const startX = 0;
  const startY = 0;
  
  const monthStr = yearMonth; // YYYY-MM
  
  // フレームが既に存在するか確認
  const existingFrames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
  const frameExists = existingFrames.some(
    (frame: any) => frame.title === `Calendar ${monthStr}`
  );
  
  if (frameExists) {
    console.warn(`${monthStr}のカレンダーは既に存在します。`);
    await moveToMonth(monthStr);
    return;
  }

  // settings.baseMonthに関係なく一貫した配置を保証するため、固定エポックに基づいて位置を計算
  const diffYear = monthDate.getFullYear() - CALENDAR_EPOCH_YEAR;
  const diffMonth = diffYear * 12 + monthDate.getMonth(); // monthは0-11
  
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
  
  // フレームキャッシュに追加
  frameCache.set(`Calendar ${monthStr}`, { frame, timestamp: Date.now() });
  
  // フレーム内に月間カレンダー構造を追加
  await createMonthlyCalendarGrid(frame, monthDate, settings);
  
  // 新しいカレンダーにビューポートを移動
  await moveToMonth(monthStr);
  
  // 新しいフレームにズームしてユーザーが確実に見られるようにする
  try {
      await miro.board.viewport.zoomTo(frame);
  } catch (e) {
      console.error('フレームへのズームに失敗しました:', e);
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
  
  // Parallelize header creation
  const headerPromises = Array.from({ length: 8 }, async (_, dow) => {
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
    return header;
  });

  const headers = await Promise.all(headerPromises);

  // Add headers to frame sequentially to avoid race conditions
  for (const header of headers) {
    await withRetry(() => frame.add(header));
  }
  
  // Draw grid lines and day numbers
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const contentStartY = frameY - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
  
  // Draw cells for each day
  // Optimized Sequential Processing:
  // We process days sequentially to ensure frame.add() works reliably,
  // but we parallelize the creation of shapes within a single day to speed it up.
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

      // Calculate day index
      const dayIndex = (week * 7) + dow - firstDayOfWeek + 1;

      // Only draw day number if this cell should have a day
      if (dayIndex >= 1 && dayIndex <= daysInMonth) {
          const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayIndex.toString().padStart(2, '0')}`;

          // Parallelize creation of the 3 components for this day
          const [cellShape, dayButton, divider] = await Promise.all([
            // 1. Cell Background
            (async () => {
                const s = await withRetry<any>(() => miro.board.createShape({
                    shape: 'rectangle',
                    x: cellCenterX,
                    y: cellCenterY,
                    width: colWidth,
                    height: rowHeight,
                    style: {
                    borderColor: isWeekend ? '#ef9a9a' : '#424242',
                    borderWidth: 4,
                    fillColor: isWeekend ? '#fafafa' : '#ffffff',
                    },
                }));
                await withRetry(() => s.setMetadata('appType', 'calendarCell'));
                await withRetry(() => s.setMetadata('date', dateStr));
                return s;
            })(),

            // 2. Day Number Button
            (async () => {
                const s = await withRetry<any>(() => miro.board.createShape({
                    shape: 'round_rectangle',
                    content: `<p><strong>${dayIndex}</strong></p>`,
                    x: cellX + 50,
                    y: cellY + 40,
                    width: 60,
                    height: 60,
                    style: {
                    fillColor: '#f5f5f5',
                    borderColor: isWeekend ? '#ef9a9a' : '#bdbdbd',
                    borderWidth: 2,
                    fontSize: 24,
                    fontFamily: 'arial',
                    color: isWeekend ? '#d32f2f' : '#424242',
                    textAlign: 'center',
                    textAlignVertical: 'middle',
                    },
                }));
                await withRetry(() => s.setMetadata('appType', 'calendarCell'));
                await withRetry(() => s.setMetadata('date', dateStr));
                await withRetry(() => s.setMetadata('isDayNumber', true));
                return s;
            })(),

            // 3. Divider Line
            (async () => {
                return await withRetry(() => miro.board.createShape({
                    shape: 'rectangle',
                    x: cellCenterX,
                    y: cellCenterY,
                    width: 8,
                    height: rowHeight - 16,
                    style: {
                    borderWidth: 0,
                    fillColor: '#e0e0e0',
                    },
                }));
            })()
          ]);
          
          // Add to frame sequentially to ensure hierarchy is correct
          await withRetry(() => frame.add(cellShape));
          await withRetry(() => frame.add(dayButton));
          await withRetry(() => frame.add(divider));
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

// フレームを見つけるヘルパー（キャッシュ付き）
export async function getCalendarFrame(year: number, month: number): Promise<any> {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const cacheKey = `Calendar ${monthStr}`;
  
  // キャッシュを確認
  const cached = frameCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < FRAME_CACHE_TTL) {
    return cached.frame;
  }
  
  // キャッシュミスの場合、フレームを取得
  const frames = await withRetry<any[]>(() => miro.board.get({ type: 'frame' }));
  const frame = frames.find((f: any) => f.title === cacheKey);
  
  // キャッシュに保存
  if (frame) {
    frameCache.set(cacheKey, { frame, timestamp: Date.now() });
  }
  
  return frame;
}

// 特定の日付のタスクの位置を計算
export async function calculateTaskPositionsForDate(
  date: string,
  tasks: Task[]
): Promise<Map<string, { x: number, y: number }>> {
  // タイムゾーンの問題を避けるため、日付文字列を手動で解析
  const [y, m, d] = date.split('-').map(Number);
  const year = y;
  const month = m - 1; // 0インデックス
  const day = d;

  // 1. フレームを検索
  let frame = await getCalendarFrame(year, month);
  
  let frameX = 0;
  let frameY = 0;
  
  if (frame) {
    frameX = frame.x;
    frameY = frame.y;
  } else {
    console.warn(`${date}のフレームが見つかりません。`);
    return new Map();
  }

  // 2. セルの位置を計算
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
  
  // 3. タスクをソート
  // 時刻順（昇順）、その後時刻なしタスクを最後に
  const sortedTasks = [...tasks].sort((a, b) => {
    const timeA = a.time?.startTime || '99:99';
    const timeB = b.time?.startTime || '99:99';
    return timeA.localeCompare(timeB);
  });
  
  // 4. スタックレイアウト（5x5グリッド）
  const positions = new Map<string, { x: number, y: number }>();
  // const MAX_COLS = 5;
  const ITEM_WIDTH = 140;
  const ITEM_HEIGHT = 140; // 想定される高さ
  const GAP = 10;
  
  // セルの左上から開始、日付番号の下
  // cellXは左端、cellYは上端
  const startX = cellX + GAP + ITEM_WIDTH / 2;
  const startY = cellY + 80 + GAP + ITEM_HEIGHT / 2; // 日付番号エリアをスキップ（約80px）
  
  // ディバイダーロジック:
  // セルは左（チーム）と右（個人）に分割される
  // ディバイダーはcellX + colWidth / 2にある
  // 左エリア: cellXからcellX + colWidth/2
  // 右エリア: cellX + colWidth/2からcellX + colWidth
  
  // 左側（チームエリア）に収まる列数を計算
  const halfWidth = colWidth / 2;
  const colsPerSide = Math.floor((halfWidth - GAP) / (ITEM_WIDTH + GAP)); // 例：2
  
  // colsPerSideを最大列数として使用し、タスクが左側に留まることを保証
  // これにより、レイアウトは「左上から下へ」（より早く次の行に折り返す）となり
  // ディバイダーを越えないようになる
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
          
          const colWidth = frameWidth / 8; // 8 columns (7 days + Weekly)
          const numWeeks = 6;
          const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks;
          
          const contentStartY = frame.y - frameHeight / 2 + headerHeight + dayOfWeekHeaderHeight;
          
          // Relative position in grid area
          const relX = x - (frame.x - frameWidth / 2);
          const relY = y - contentStartY;
          
          if (relX >= 0 && relX <= frameWidth && relY >= 0 && relY <= numWeeks * rowHeight) {
              const col = Math.floor(relX / colWidth);
              const row = Math.floor(relY / rowHeight);
              
              // Handle Weekly column (col 7)
              if (col === 7) {
                  console.log('Dropped in Weekly column - ignoring for now');
                  return null;
              }

              // Calculate Date
              const firstDay = new Date(year, month, 1);
              const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
              
              // dayIndex = row * 7 + col - firstDayOfWeek + 1
              const dayIndex = row * 7 + col - firstDayOfWeek + 1;
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
