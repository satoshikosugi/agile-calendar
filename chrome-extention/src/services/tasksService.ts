import { Task, Settings } from '../models/types';
import { loadTasks } from './storageService';
import {
  getStickyNotes,
  createStickyNote,
  updateStickyNote,
  MiroStickyNote,
} from './miroApiService';
import { getCalendarFrame, calculateTaskPositionsForDate } from './calendarLayoutService';
import { parseTime, formatTime } from './scheduleService';

const TASK_ID_TAG = 'agile-task-id:';

// Derive sticky-note fill colour from task.
// Miro sticky_note API only accepts named colours (not hex).
function getTaskColor(task: Task): string {
  switch (task.status) {
    case 'Done': return 'light_green';
    case 'Planned': return 'light_blue';
    default: return 'light_yellow'; // Draft
  }
}

// Build the text content for a sticky note
function formatTaskContent(task: Task, settings: Settings): string {
  const lines: string[] = [];

  // 1. Title
  lines.push(task.title);

  // 2. Time range
  if (task.time?.startTime) {
    if (task.time.duration) {
      const startMins = parseTime(task.time.startTime);
      const endMins = startMins + task.time.duration;
      lines.push(`${task.time.startTime}-${formatTime(endMins)}`);
    } else {
      lines.push(task.time.startTime);
    }
  }

  // 3. Participants
  const parts: string[] = [];

  if (task.roles.pmId) {
    const pm = settings.devs.find((d) => d.id === task.roles.pmId);
    if (pm) parts.push(`${pm.name}(PM)`);
  }

  if (task.roles.devPlan.mode === 'Tracks') {
    const ids = task.roles.devPlan.assignedTrackIds ?? [];
    if (ids.length > 0) {
      const names = ids
        .map((id) => settings.tracks.find((t) => t.id === id)?.name ?? '')
        .filter(Boolean);
      parts.push(names.join(', '));
    } else {
      parts.push(`${task.roles.devPlan.requiredTrackCount}Track`);
    }
  } else if (task.roles.devPlan.mode === 'AllDev') {
    parts.push('All Dev');
  }

  if (task.roles.designerIds?.length) {
    const names = task.roles.designerIds
      .map((id) => settings.devs.find((d) => d.id === id)?.name ?? '')
      .filter(Boolean);
    parts.push(...names);
  }

  if (parts.length > 0) lines.push(parts.join('、'));

  // 4. External teams
  if (task.externalParticipants?.length) {
    const teams = task.externalParticipants
      .map((p) => settings.externalTeams.find((t) => t.id === p.teamId)?.name ?? '')
      .filter(Boolean);
    if (teams.length) lines.push(teams.join('、'));
  }

  // Embed task id in a hidden last line so we can identify the note later
  lines.push(`${TASK_ID_TAG}${task.id}`);

  return lines.join('\n');
}

function extractTaskId(note: MiroStickyNote): string | null {
  const content = note.data?.content ?? '';
  const match = content.match(new RegExp(`${TASK_ID_TAG}([^\\s]+)`));
  return match ? match[1] : null;
}

/**
 * Place/update tasks for a given month as sticky notes on the Miro calendar.
 * Creates a note if one doesn't exist yet; updates content & position otherwise.
 */
export async function rearrangeTasksForMonth(
  yearMonth: string,
  settings: Settings,
  boardId: string,
  token: string,
  onProgress?: (msg: string) => void
): Promise<string[]> {
  const errors: string[] = [];

  async function tryStep(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${label}] ${msg}`);
    }
  }

  // 1. Load all tasks from local storage
  const allTasks = await loadTasks();
  const monthTasks = allTasks.filter((t) => t.date?.startsWith(yearMonth));

  if (monthTasks.length === 0) {
    onProgress?.('この月にタスクがありません。');
    return errors;
  }

  // 2. Fetch existing sticky notes to identify ones already created for this month
  onProgress?.('既存の付箋を取得中...');
  let existingNotes: MiroStickyNote[] = [];
  await tryStep('sticky_notes 取得', async () => {
    existingNotes = await getStickyNotes(boardId, token);
  });

  // Build a map: taskId -> existing sticky note
  const noteByTaskId = new Map<string, MiroStickyNote>();
  for (const note of existingNotes) {
    const id = extractTaskId(note);
    if (id) noteByTaskId.set(id, note);
  }

  // 3. Group tasks by date
  const tasksByDate = new Map<string, Task[]>();
  for (const task of monthTasks) {
    if (!task.date) continue;
    if (!tasksByDate.has(task.date)) tasksByDate.set(task.date, []);
    tasksByDate.get(task.date)!.push(task);
  }

  // 4. For each date, calculate positions and create/update notes
  const [yearStr, monthStr] = yearMonth.split('-').map(Number);
  const year = yearStr;
  const month = monthStr - 1; // 0-indexed

  onProgress?.('カレンダーフレームを確認中...');
  const frame = await getCalendarFrame(boardId, token, year, month);
  if (!frame) {
    errors.push(`[フレーム取得] ${yearMonth} のカレンダーフレームが見つかりません。先にカレンダーを生成してください。`);
    return errors;
  }

  let taskCount = 0;
  const totalTasks = monthTasks.length;

  for (const [date, dateTasks] of tasksByDate.entries()) {
    const positions = calculateTaskPositionsForDate(date, dateTasks, frame);

    for (const task of dateTasks) {
      taskCount++;
      onProgress?.(`タスクを配置中... (${taskCount}/${totalTasks}) ${task.title}`);

      const pos = positions.get(task.id);
      if (!pos) continue;

      const content = formatTaskContent(task, settings);
      const fillColor = getTaskColor(task);
      const existingNote = noteByTaskId.get(task.id);

      if (existingNote) {
        // Update existing note
        await tryStep(`更新[${task.title}]`, () =>
          updateStickyNote(boardId, token, existingNote.id, {
            content,
            x: pos.x,
            y: pos.y,
            fillColor,
            parentId: frame.id,
          })
        );
      } else {
        // Create new note
        await tryStep(`作成[${task.title}]`, async () => {
          await createStickyNote(boardId, token, {
            content,
            x: pos.x,
            y: pos.y,
            width: 140,
            fillColor,
            parentId: frame.id,
          });
        });
      }
    }
  }

  onProgress?.('タスク配置が完了しました。');
  return errors;
}
