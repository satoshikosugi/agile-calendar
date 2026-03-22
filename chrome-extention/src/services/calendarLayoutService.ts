import { Settings } from '../models/types';
import {
  getFrames,
  createFrame,
  createText,
  createShape,
  MiroFrame,
} from './miroApiService';

// Calendar layout constants (must match original app)
const CALENDAR_FRAME_WIDTH = 4200;
const CALENDAR_FRAME_HEIGHT = 4800;
const CALENDAR_FRAME_SPACING = 600;
const CALENDAR_EPOCH_YEAR = 2024;

export interface GenerateResult {
  warnings: string[];
}

export async function generateCalendar(
  yearMonth: string,
  settings: Settings,
  boardId: string,
  token: string,
  onProgress?: (msg: string) => void
): Promise<GenerateResult> {
  const monthDate = new Date(yearMonth + '-01');
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  const frameSpacing = CALENDAR_FRAME_SPACING;

  onProgress?.('既存のカレンダーフレームを確認中...');

  // Check if frame already exists
  const existingFrames = await getFrames(boardId, token);
  const frameTitle = `Calendar ${yearMonth}`;
  const frameExists = existingFrames.some((f) => f.data?.title === frameTitle);

  if (frameExists) {
    throw new Error(`${yearMonth} のカレンダーはすでに存在します。`);
  }

  // Calculate position based on fixed epoch
  const diffYear = monthDate.getFullYear() - CALENDAR_EPOCH_YEAR;
  const diffMonth = diffYear * 12 + monthDate.getMonth();
  const x = diffMonth * (frameWidth + frameSpacing);
  const y = 0;

  onProgress?.('カレンダーフレームを作成中...');

  const frame = await createFrame(boardId, token, {
    title: frameTitle,
    x,
    y,
    width: frameWidth,
    height: frameHeight,
  });

  onProgress?.('カレンダーグリッドを描画中...');

  const warnings = await createMonthlyCalendarGrid(frame, monthDate, settings, boardId, token, onProgress);
  return { warnings };
}

async function createMonthlyCalendarGrid(
  frame: MiroFrame,
  monthDate: Date,
  _settings: Settings,
  boardId: string,
  token: string,
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const errors: string[] = [];

  // Helper: try to create an item, collect error if it fails
  async function tryCreate(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${label}] ${msg}`);
    }
  }

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  // Use constants directly to avoid relying on API response geometry
  // Miro REST API uses top-left origin for frame-local child item coordinates:
  //   x ∈ [0, frameWidth], y ∈ [0, frameHeight]
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const frameHeight = CALENDAR_FRAME_HEIGHT;
  const halfW = frameWidth / 2;   // 2100 — used as x-center of frame in TL coords
  const halfH = frameHeight / 2;  // 2400 — unused for coords, kept for clarity

  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 6;   // 700
  const numWeeks = 6;
  const rowHeight = (frameHeight - headerHeight - dayOfWeekHeaderHeight) / numWeeks; // 760

  const monthNameJa = [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ];

  // Month title (frame-local, top-left origin)
  onProgress?.('月タイトルを作成中...');
  await tryCreate('月タイトル', () => createText(boardId, token, {
    content: `${year}年 ${monthNameJa[month]}`,
    x: halfW,
    y: headerHeight / 2,
    width: frameWidth - 80,
    style: {
      fontSize: 48,
      fontFamily: 'arial',
      color: '#1a1a1a',
      textAlign: 'center',
      fillOpacity: 0,
    },
    parentId: frame.id,
  }));

  // Day-of-week headers
  const daysOfWeek = ['月', '火', '水', '木', '金', 'Weekly'];
  onProgress?.('曜日ヘッダーを作成中...');
  for (let dow = 0; dow < 6; dow++) {
    const hx = colWidth * (dow + 0.5);
    const hy = headerHeight + dayOfWeekHeaderHeight / 2;
    const isWeekly = dow === 5;

    await tryCreate(`曜日ヘッダー[${daysOfWeek[dow]}]`, () => createText(boardId, token, {
      content: daysOfWeek[dow],
      x: hx,
      y: hy,
      width: colWidth - 20,
      style: {
        fontSize: 32,
        fontFamily: 'arial',
        color: '#424242',
        textAlign: 'center',
        ...(isWeekly ? { fillColor: '#fff9c4', fillOpacity: 1 } : { fillOpacity: 0 }),
      },
      parentId: frame.id,
    }));
  }

  // contentStartY: top of grid area (frame-local, top-left origin)
  const contentStartY = headerHeight + dayOfWeekHeaderHeight;
  const contentHeight = numWeeks * rowHeight;

  // Vertical grid lines (inner separators only: i=1..5; avoid frame edges)
  onProgress?.('グリッド線を描画中...');
  for (let i = 1; i < 6; i++) {
    const lineX = colWidth * i;
    const lineY = contentStartY + contentHeight / 2;

    await tryCreate(`縦線[${i}]`, () => createShape(boardId, token, {
      shape: 'rectangle',
      x: lineX,
      y: lineY,
      width: 8,
      height: contentHeight - 8,
      style: { fillColor: '#e0e0e0', borderOpacity: 0 },
      parentId: frame.id,
    }));
  }

  // Horizontal grid lines (inner only: i=1..numWeeks-1; top/bottom kept 8px inward)
  for (let i = 0; i <= numWeeks; i++) {
    const rawY = contentStartY + rowHeight * i;
    // Keep lines strictly inside frame (8px margin from top/bottom)
    const lineY = i === 0 ? rawY + 4 : i === numWeeks ? rawY - 4 : rawY;
    const lineWidth = frameWidth - 16;

    await tryCreate(`横線[${i}]`, () => createShape(boardId, token, {
      shape: 'rectangle',
      x: halfW,
      y: lineY,
      width: lineWidth,
      height: 8,
      style: { fillColor: '#e0e0e0', borderOpacity: 0 },
      parentId: frame.id,
    }));
  }

  // Day number buttons
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0, Sun=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  onProgress?.('日付ボタンを作成中...');
  for (let day = 1; day <= daysInMonth; day++) {
    const absoluteCol = firstDayOfWeek + (day - 1);
    const row = Math.floor(absoluteCol / 7);
    const col = absoluteCol % 7;

    if (col >= 5) continue; // Skip Sat(5) and Sun(6)

    // Cell top-left corner (frame-local, top-left origin)
    const cellX = colWidth * col;
    const cellY = contentStartY + rowHeight * row;

    // Button: small offset from cell top-left
    const btnX = cellX + 50;
    const btnY = cellY + 40;

    await tryCreate(`日付ボタン[${day}日]`, () => createShape(boardId, token, {
      shape: 'round_rectangle',
      content: `<p><strong>${day}</strong></p>`,
      x: btnX,
      y: btnY,
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
      parentId: frame.id,
    }));
  }

  return errors;
}

// Check if Miro settings are configured
export function hasMiroSettings(miroApiToken?: string, miroBoardId?: string): boolean {
  return !!(miroApiToken?.trim() && miroBoardId?.trim());
}

// Find the Miro frame for a given year/month
export async function getCalendarFrame(
  boardId: string,
  token: string,
  year: number,
  month: number // 0-indexed
): Promise<import('./miroApiService').MiroFrame | null> {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const frames = await getFrames(boardId, token);
  return frames.find((f) => f.data?.title === `Calendar ${monthStr}`) ?? null;
}

/**
 * Calculate frame-local (top-left origin) positions for tasks on a given date.
 * Returns a Map of task.id -> { x, y }.
 *
 * When creating/updating child items with parentId, Miro REST API expects
 * coordinates relative to the frame's top-left corner (x: 0..frameWidth,
 * y: 0..frameHeight) — NOT board-absolute coordinates.
 */
export function calculateTaskPositionsForDate(
  date: string,
  tasks: { id: string; time?: { startTime?: string } }[],
  _frame: import('./miroApiService').MiroFrame
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Parse date manually to avoid TZ issues
  const [y, m, d] = date.split('-').map(Number);
  const year = y;
  const month = m - 1; // 0-indexed
  const day = d;

  // --- Layout constants (must match createMonthlyCalendarGrid) ---
  const frameWidth = CALENDAR_FRAME_WIDTH;
  const headerHeight = 160;
  const dayOfWeekHeaderHeight = 80;
  const colWidth = frameWidth / 6; // 700
  const numWeeks = 6;
  const rowHeight = (CALENDAR_FRAME_HEIGHT - headerHeight - dayOfWeekHeaderHeight) / numWeeks; // 760

  // Determine col/row of this date in the calendar grid
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0
  const absoluteCol = firstDayOfWeek + (day - 1);
  const weekRow = Math.floor(absoluteCol / 7);
  const dayOfWeek = absoluteCol % 7;

  if (dayOfWeek >= 5) return positions; // weekend — no column for Sat/Sun

  // Cell top-left in frame-local coords (TL origin, same as createMonthlyCalendarGrid)
  const contentStartY = headerHeight + dayOfWeekHeaderHeight; // 240
  const cellX = colWidth * dayOfWeek;
  const cellY = contentStartY + rowHeight * weekRow;

  // Sticky notes stacked top-to-bottom first, overflow to right column
  const ITEM_WIDTH = 140;
  const ITEM_HEIGHT = 140;
  const GAP = 10;
  const cellContentStartOffset = 80; // space for date button at top of cell
  const availableHeight = rowHeight - cellContentStartOffset - GAP;
  // How many items fit vertically in one column before overflowing right
  const maxRows = Math.max(1, Math.floor(availableHeight / (ITEM_HEIGHT + GAP)));

  // Sort by time ascending (untimed tasks last)
  const sorted = [...tasks].sort((a, b) => {
    const ta = a.time?.startTime ?? '99:99';
    const tb = b.time?.startTime ?? '99:99';
    return ta.localeCompare(tb);
  });

  sorted.forEach((task, index) => {
    const col = Math.floor(index / maxRows);
    const row = index % maxRows;
    const x = cellX + GAP + ITEM_WIDTH / 2 + col * (ITEM_WIDTH + GAP);
    const y = cellY + cellContentStartOffset + GAP + ITEM_HEIGHT / 2 + row * (ITEM_HEIGHT + GAP);
    positions.set(task.id, { x, y });
  });

  return positions;
}
