import { Task, Settings } from '../models/types';
import { miro } from '../miro';
import { loadSettings } from './settingsService';
import { calculateTaskPosition, calculateTaskPositionsForDate, getCalendarFrame, calculatePersonalSchedulePosition, getDateFromPosition, PERSONAL_NOTE_WIDTH } from './calendarLayoutService';
import { parseTime, formatTime } from './scheduleService';
import { withRetry, sleep } from '../utils/retry';

const TASK_METADATA_KEY = 'task';
const PERSONAL_SCHEDULE_APP_TYPE = 'personalSchedule';

// Debounce configuration
let moveDebounceTimer: any = null;
const pendingMoveItems = new Map<string, any>();
const MOVE_DEBOUNCE_MS = 10000; // 10 seconds delay

// Handle task movement on the board
export async function handleTaskMove(items: any[]): Promise<void> {
  console.log('handleTaskMove called with', items.length, 'items');
  
  // Add items to pending map
  for (const item of items) {
      // Only track sticky notes
      if (item.type === 'sticky_note') {
          pendingMoveItems.set(item.id, item);
      }
  }

  // Reset timer
  if (moveDebounceTimer) {
      clearTimeout(moveDebounceTimer);
  }

  console.log(`Queued ${pendingMoveItems.size} items for move. Waiting ${MOVE_DEBOUNCE_MS}ms...`);

  moveDebounceTimer = setTimeout(async () => {
      await processPendingMoves();
  }, MOVE_DEBOUNCE_MS);
}

// Process queued moves in batch
async function processPendingMoves() {
    console.log('Processing pending moves...');
    const items = Array.from(pendingMoveItems.values());
    pendingMoveItems.clear();
    moveDebounceTimer = null;

    if (items.length === 0) return;

    const affectedDates = new Set<string>();
    const settings = await loadSettings();

    try {
        // 1. Update all tasks and collect affected dates
        for (const item of items) {
            try {
                // Re-fetch item to ensure we have the latest coordinates
                const freshItems = await withRetry<any[]>(() => miro.board.get({ id: item.id }));
                if (!freshItems || freshItems.length === 0) continue;
                
                const freshItem = freshItems[0];
                const metadata = await freshItem.getMetadata(TASK_METADATA_KEY);
                
                if (!metadata || !(metadata as Task).id) continue;
                
                const task = metadata as Task;
                const oldDate = task.date;
                
                // Calculate new date based on position
                const newDate = await getDateFromPosition(freshItem.x, freshItem.y, freshItem);
                
                if (newDate && newDate !== oldDate) {
                    console.log(`Task ${task.title} moved from ${oldDate} to ${newDate}`);
                    
                    // Update task date
                    const updatedTask = { ...task, date: newDate };
                    
                    // Update metadata directly (skip full updateTask to avoid double reorganize)
                    await updateStickyNoteProperties(freshItem, updatedTask, settings);
                    
                    // CRITICAL FIX: Explicitly add to the new date's frame
                    // This ensures reorganizeTasksOnDate finds it via frame.getChildren()
                    const dateObj = new Date(newDate);
                    const frame = await getCalendarFrame(dateObj.getFullYear(), dateObj.getMonth());
                    if (frame) {
                        await withRetry(() => frame.add(freshItem));
                    }

                    if (oldDate) affectedDates.add(oldDate);
                    affectedDates.add(newDate);
                }
            } catch (e) {
                console.error('Error processing individual item move:', e);
            }
        }

        // 2. Prepare for reorganization
        // Fetch all notes and group them to minimize API calls
        // This ensures we find ALL tasks, even those not properly parented to frames
        const allNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
        const notesByDate = new Map<string, { note: any, task: Task }[]>();
        
        // Batch metadata fetching
        const BATCH_SIZE = 10;
        for (let i = 0; i < allNotes.length; i += BATCH_SIZE) {
            const batch = allNotes.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (note) => {
                try {
                    const metadata = await note.getMetadata(TASK_METADATA_KEY);
                    if (metadata && (metadata as Task).date) {
                        const task = metadata as Task;
                        const date = task.date;
                        if (date) { // Ensure date is not undefined
                            if (!notesByDate.has(date)) {
                                notesByDate.set(date, []);
                            }
                            notesByDate.get(date)!.push({ note, task });
                        }
                    }
                } catch (e) { }
            }));
        }

        // 3. Reorganize affected dates
        console.log('Reorganizing affected dates:', Array.from(affectedDates));
        for (const date of affectedDates) {
            const notesForDate = notesByDate.get(date) || [];
            await reorganizeTasksOnDate(date, undefined, notesForDate);
            // Small delay between dates to be safe
            await sleep(200);
        }
    } catch (error) {
        console.error('Error in processPendingMoves:', error);
    }
}

// Helper to format task content
function formatTaskContent(task: Task, settings: Settings): string {
  const lines: string[] = [];

  // 1. Time Range
  if (task.time && task.time.startTime && task.time.duration) {
    const startMins = parseTime(task.time.startTime);
    const endMins = startMins + task.time.duration;
    lines.push(`${task.time.startTime}-${formatTime(endMins)}`);
  } else if (task.time && task.time.startTime) {
    lines.push(task.time.startTime);
  }

  // 2. Title
  lines.push(task.title);

  // 3. Participants
  const participants: string[] = [];
  
  // PM
  if (task.roles.pmId) {
    const pm = settings.devs.find(d => d.id === task.roles.pmId);
    if (pm) participants.push(`${pm.name}(PM)`);
  }

  // Dev Plan
  if (task.roles.devPlan.mode === 'Tracks') {
    const assignedIds = task.roles.devPlan.assignedTrackIds || [];
    if (assignedIds.length > 0) {
      // Confirmed: Track Names
      const trackNames = assignedIds.map(id => {
        const track = settings.tracks.find(t => t.id === id);
        return track ? track.name : '';
      }).filter(Boolean);
      participants.push(trackNames.join(', '));
    } else {
      // Unconfirmed: Required Count
      participants.push(`${task.roles.devPlan.requiredTrackCount}Track`);
    }
  } else if (task.roles.devPlan.mode === 'AllDev') {
    participants.push('All Dev');
  }

  // Designers / Others
  if (task.roles.designerIds && task.roles.designerIds.length > 0) {
    const designers = task.roles.designerIds.map(id => {
      const dev = settings.devs.find(d => d.id === id);
      return dev ? dev.name : '';
    }).filter(Boolean);
    participants.push(...designers);
  }

  if (participants.length > 0) {
    lines.push(participants.join('、'));
  }

  // 4. External Teams
  if (task.externalParticipants && task.externalParticipants.length > 0) {
    const teams = task.externalParticipants.map(p => {
      const team = settings.externalTeams.find(t => t.id === p.teamId);
      return team ? team.name : '';
    }).filter(Boolean);
    if (teams.length > 0) {
      lines.push(teams.join('、'));
    }
  }

  // 5. External Link (Embedded HTML)
  if (task.externalLink) {
    lines.push(`<a href="${task.externalLink}">🔗Link</a>`);
  }

  // Return as HTML paragraph with line breaks
  return `<p>${lines.join('<br>')}</p>`;
}

// Helper function to remove existing link indicators for a task
async function removeExistingLinkShapes(taskId: string): Promise<void> {
  const allShapes = await withRetry<any[]>(() => miro.board.get({ type: 'shape' }));
  const allTexts = await withRetry<any[]>(() => miro.board.get({ type: 'text' }));
  
  for (const shape of allShapes) {
    const appType = await withRetry(() => shape.getMetadata('appType'));
    const linkedTaskId = await withRetry(() => shape.getMetadata('taskId'));
    if (appType === 'taskLink' && linkedTaskId === taskId) {
      await withRetry(() => miro.board.remove(shape));
    }
  }
  
  // Also remove text elements associated with the link
  for (const text of allTexts) {
    const appType = await withRetry(() => text.getMetadata('appType'));
    const linkedTaskId = await withRetry(() => text.getMetadata('taskId'));
    if (appType === 'taskLink' && linkedTaskId === taskId) {
      await withRetry(() => miro.board.remove(text));
    }
  }
}

// Helper to update all properties of a sticky note based on a task
async function updateStickyNoteProperties(note: any, task: Task, settings: Settings, skipLinkCleanup = false): Promise<void> {
  // 1. Update content
  note.content = formatTaskContent(task, settings);
  
  // 2. Update style
  note.style = {
    ...note.style,
    fillColor: getTaskColor(task),
  };
  
  // 3. Update Metadata
  const cleanTask = JSON.parse(JSON.stringify(task));
  await withRetry(() => note.setMetadata(TASK_METADATA_KEY, cleanTask));
  await withRetry(() => note.setMetadata('appType', 'task'));

  // 4. Sync changes
  await withRetry(() => note.sync());

  // 5. Remove legacy link shapes (unless skipped)
  if (!skipLinkCleanup) {
    await removeExistingLinkShapes(task.id);
  }
}

// Helper to detach a note from its parent frame
async function detachFromParent(note: any, signal?: AbortSignal) {
    if (note.parentId) {
        try {
            const parentItems = await withRetry<any[]>(() => miro.board.get({ id: note.parentId }), signal);
            if (parentItems && parentItems.length > 0) {
                const parent = parentItems[0];
                // Check if parent has remove method (Frame usually does)
                if (parent.remove) {
                    await withRetry(() => parent.remove(note), signal);
                }
            }
        } catch (e) {
            console.warn('Failed to detach from parent', e);
        }
    }
}

// Helper to reorganize tasks on a specific date to prevent overlap
export async function reorganizeTasksOnDate(
  date: string, 
  updatedTask?: Task, 
  preFilteredNotes?: { note: any, task: Task }[]
): Promise<void> {
  try {
    let dateNotes: { note: any, task: Task }[] = [];

    if (preFilteredNotes) {
        dateNotes = preFilteredNotes;
    } else {
        // Fallback: Global search to ensure we don't miss any tasks (even if not properly parented)
        // We avoid frame.getChildren() because it might miss items that are visually on the frame but not structurally children
        const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
        
        // Fetch metadata in parallel
        const BATCH_SIZE = 10;
        for (let i = 0; i < stickyNotes.length; i += BATCH_SIZE) {
            const batch = stickyNotes.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (note) => {
                try {
                    const metadata = await note.getMetadata(TASK_METADATA_KEY);
                    return { note, metadata };
                } catch (e) {
                    return { note, metadata: null };
                }
            }));

            for (const { note, metadata } of results) {
                let task = metadata as Task;

                // Use updated task data if provided
                if (updatedTask && task && task.id === updatedTask.id) {
                    task = updatedTask;
                }

                if (task && task.date === date) {
                    dateNotes.push({ note, task });
                }
            }
        }
    }

    if (dateNotes.length === 0) return;

    // 3. Calculate new positions
    const tasks = dateNotes.map(dn => dn.task);
    const newPositions = await calculateTaskPositionsForDate(date, tasks);
    const settings = await loadSettings(); // This is now cached!

    // Get frame for this date to ensure items are on top
    const taskDate = new Date(date);
    const frame = await getCalendarFrame(taskDate.getFullYear(), taskDate.getMonth());

    // 4. Update positions and content
    for (const { note, task } of dateNotes) {
      const pos = newPositions.get(task.id);
      if (pos) {
        // Update all properties (content, color, url, metadata)
        await updateStickyNoteProperties(note, task, settings);

        // Try to add to frame FIRST (Z-order / Reparenting)
        if (frame) {
            try {
                // Only add if not already a child (optimization)
                if (note.parentId !== frame.id) {
                    await withRetry(() => frame.add(note));
                }
            } catch (e) {
                // Ignore if fails
            }
        }

        // Only update if position changed significantly
        if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1) {
          // If note is already in a frame (has parentId), we might need to remove it first
          // or just try to move. If it fails, we try to remove from frame.
          try {
             note.x = pos.x;
             note.y = pos.y;
             await withRetry(() => note.sync());
          } catch (e: any) {
             // If error is about child item, try to remove from parent first
             if (e.message && e.message.includes('child of another board item')) {
                 try {
                     await detachFromParent(note);
                     
                     // Retry move
                     note.x = pos.x;
                     note.y = pos.y;
                     await withRetry(() => note.sync());
                 } catch (retryError) {
                     console.error('Failed to move task even after removing from frame', retryError);
                 }
             } else {
                 throw e;
             }
          }
        }
      }
    }

    // 5. Reorganize Personal Schedules (NEW)
    // Find personal notes for this date (using frame children for efficiency)
    if (frame) {
        const children = await frame.getChildren();
        const personalNotes: any[] = [];
        
        for (const child of children) {
            if (child.type === 'sticky_note') {
                try {
                    const appType = await child.getMetadata('appType');
                    if (appType === PERSONAL_SCHEDULE_APP_TYPE) {
                        const noteDate = await child.getMetadata('date');
                        if (noteDate === date) {
                            personalNotes.push(child);
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
        }

        if (personalNotes.length > 0) {
            // Sort by Y position to maintain relative order
            personalNotes.sort((a, b) => a.y - b.y);
            
            for (let i = 0; i < personalNotes.length; i++) {
                const note = personalNotes[i];
                const pos = await calculatePersonalSchedulePosition(date, i);
                
                // Update position and size if needed
                if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1 || note.width !== PERSONAL_NOTE_WIDTH) {
                    note.x = pos.x;
                    note.y = pos.y;
                    note.width = PERSONAL_NOTE_WIDTH;
                    
                    try {
                        await withRetry(() => note.sync());
                    } catch (e) {
                        console.error('Failed to sync personal note', e);
                    }
                }
            }
        }
    }
  } catch (error) {
    console.error('Error reorganizing tasks:', error);
  }
}

// Create a new task as a sticky note on the board
export async function createTask(task: Task): Promise<Task> {
  try {
    // Calculate position based on date and settings
    const settings = await loadSettings();
    // Initial position (might be adjusted by reorganize)
    const position = await calculateTaskPosition(task, settings);

    // Format sticky note content
    const content = formatTaskContent(task, settings);

    const stickyNote = await withRetry(() => miro.board.createStickyNote({
      content: content,
      x: position.x,
      y: position.y,
      width: 140,
      style: {
        fillColor: getTaskColor(task),
        fontSize: 14,
      },
    }));
    
    // Update properties using common helper (sets metadata, etc.)
    await updateStickyNoteProperties(stickyNote, task, settings);
    
    // Add to frame if exists (ensures visibility on top of frame)
    if (task.date) {
        const date = new Date(task.date);
        const frame = await getCalendarFrame(date.getFullYear(), date.getMonth());
        if (frame) {
            try {
                await withRetry(() => frame.add(stickyNote));
            } catch (e) {
                console.warn('Failed to add task to frame', e);
            }
        }
    }
    
    // Reorganize tasks on this date to prevent overlap
    if (task.date) {
      await reorganizeTasksOnDate(task.date, task);
    }

    return task;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Remove createExternalLinkIndicator function entirely
// async function createExternalLinkIndicator(stickyNote: any, url: string): Promise<void> { ... }

// Helper function to get task color based on status
function getTaskColor(task: Task): string {
  switch (task.status) {
    case 'Draft':
      return 'light_yellow';
    case 'Planned':
      return 'light_green';
    case 'Done':
      return 'gray';
    default:
      return 'light_yellow';
  }
}

// Load all tasks from the board
export async function loadTasks(): Promise<Task[]> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    const tasks: Task[] = [];
    
    for (const note of stickyNotes) {
      const appType = await withRetry(() => note.getMetadata('appType'));
      if (appType === 'task') {
        const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
        if (metadata) {
          tasks.push(metadata as Task);
        }
      } else {
        // Fallback for backward compatibility or if appType wasn't set but TASK_METADATA_KEY exists
        const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
        if (metadata) {
           tasks.push(metadata as Task);
        }
      }
    }
    
    return tasks;
  } catch (error) {
    console.error('Error loading tasks:', error);
    return [];
  }
}

// Update an existing task
export async function updateTask(task: Task, providedSettings?: Settings): Promise<void> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    
    for (const note of stickyNotes) {
      const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
      if (metadata && (metadata as Task).id === task.id) {
        const oldTask = metadata as Task;
        
        // Update all properties using common helper
        const settings = providedSettings || await loadSettings();
        await updateStickyNoteProperties(note, task, settings);
        
        // Reorganize tasks on this date to prevent overlap
        // Also reorganize old date if date changed
        if (task.date) {
          await reorganizeTasksOnDate(task.date, task);
        }
        if (oldTask.date && oldTask.date !== task.date) {
          await reorganizeTasksOnDate(oldTask.date);
        }
        
        return;
      }
    }
    
    throw new Error(`Task with id ${task.id} not found`);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Remove updateExternalLinkIndicator function entirely
// async function updateExternalLinkIndicator(stickyNote: any, task: Task): Promise<void> { ... }

// Delete a task
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    
    for (const note of stickyNotes) {
      const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
      if (metadata && (metadata as Task).id === taskId) {
        const task = metadata as Task;
        
        // Remove associated link indicators using the helper function
        await removeExistingLinkShapes(taskId);
        
        // Remove the sticky note
        await withRetry(() => miro.board.remove(note));
        
        // Reorganize remaining tasks on this date
        if (task.date) {
          await reorganizeTasksOnDate(task.date);
        }
        
        return;
      }
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

// Get a single task by ID
export async function getTask(taskId: string): Promise<Task | null> {
  try {
    const stickyNotes = await miro.board.get({ type: 'sticky_note' });
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata && (metadata as Task).id === taskId) {
        return metadata as Task;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting task:', error);
    return null;
  }
}

// Bulk update tasks
export async function bulkUpdateTasks(tasksToUpdate: Task[]): Promise<void> {
  try {
    const settings = await loadSettings();
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    const affectedDates = new Set<string>();
    
    // Create a map of taskId -> note to avoid O(N^2) lookups
    const taskNoteMap = new Map<string, any>();
    
    // We need to read metadata from all notes to build the map
    for (const note of stickyNotes) {
        try {
            // Use a simpler check if possible, or just try to get task metadata directly
            // Getting metadata is an API call, so we want to minimize it.
            // However, we don't know which notes are tasks without checking.
            // Optimization: Check if it has our specific metadata key first if possible? 
            // Miro SDK doesn't support "hasMetadata".
            
            const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
            if (metadata && (metadata as Task).id) {
                taskNoteMap.set((metadata as Task).id, note);
            }
        } catch (e) {
            // ignore
        }
    }

    for (const task of tasksToUpdate) {
        const note = taskNoteMap.get(task.id);
        if (note) {
            // Get old task to check for date change
            const oldTask = await withRetry(() => note.getMetadata(TASK_METADATA_KEY)) as Task;
            
            if (oldTask.date) affectedDates.add(oldTask.date);
            if (task.date) affectedDates.add(task.date);

            await updateStickyNoteProperties(note, task, settings);
        }
    }

    // Reorganize affected dates efficiently
    // Instead of calling reorganizeTasksOnDate (which fetches all notes), we use the notes we already have if possible.
    // But reorganizeTasksOnDate needs ALL notes for that date to calculate positions correctly.
    // So we must fetch notes. But we can optimize by fetching ONCE if we rewrite the logic.
    // For now, let's just add a delay to avoid rate limits.
    for (const date of affectedDates) {
        await sleep(200); // Add delay between date reorganizations
        await reorganizeTasksOnDate(date);
    }

  } catch (error) {
    console.error('Error in bulk update:', error);
    throw error;
  }
}

// Bulk delete tasks
export async function bulkDeleteTasks(taskIds: string[]): Promise<void> {
  try {
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }));
    const allShapes = await withRetry<any[]>(() => miro.board.get({ type: 'shape' }));
    const allTexts = await withRetry<any[]>(() => miro.board.get({ type: 'text' }));
    
    const affectedDates = new Set<string>();
    const itemsToRemove: any[] = [];
    const taskIdsSet = new Set(taskIds);

    // Find notes to delete
    for (const note of stickyNotes) {
        try {
            const metadata = await withRetry(() => note.getMetadata(TASK_METADATA_KEY));
            if (metadata && (metadata as Task).id && taskIdsSet.has((metadata as Task).id)) {
                const task = metadata as Task;
                itemsToRemove.push(note);
                if (task.date) affectedDates.add(task.date);
            }
        } catch (e) {
            // ignore
        }
    }
    
    // Find links to delete
    for (const shape of allShapes) {
        try {
            const appType = await withRetry(() => shape.getMetadata('appType'));
            const linkedTaskId = await withRetry(() => shape.getMetadata('taskId'));
            if (appType === 'taskLink' && linkedTaskId && typeof linkedTaskId === 'string' && taskIdsSet.has(linkedTaskId)) {
                itemsToRemove.push(shape);
            }
        } catch (e) {}
    }
    
    for (const text of allTexts) {
        try {
            const appType = await withRetry(() => text.getMetadata('appType'));
            const linkedTaskId = await withRetry(() => text.getMetadata('taskId'));
            if (appType === 'taskLink' && linkedTaskId && typeof linkedTaskId === 'string' && taskIdsSet.has(linkedTaskId)) {
                itemsToRemove.push(text);
            }
        } catch (e) {}
    }

    // Delete all items
    for (const item of itemsToRemove) {
        await withRetry(() => miro.board.remove(item));
    }

    // Reorganize affected dates
    for (const date of affectedDates) {
        await reorganizeTasksOnDate(date);
    }

  } catch (error) {
    console.error('Error in bulk delete:', error);
    throw error;
  }
}

// Render personal schedules for a month
export async function renderPersonalSchedulesForMonth(yearMonth: string, signal?: AbortSignal): Promise<void> {
  try {
    const settings = await loadSettings();
    const [yearStr, monthStr] = yearMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    // 1. Get all existing personal schedule notes
    const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), signal);
    const existingNotes = [];
    
    for (const note of stickyNotes) {
      try {
        const appType = await withRetry(() => note.getMetadata('appType'), signal);
        if (appType === PERSONAL_SCHEDULE_APP_TYPE) {
          const noteDate = await withRetry<string>(() => note.getMetadata('date'), signal);
          if (noteDate && typeof noteDate === 'string' && noteDate.startsWith(yearMonth)) {
            existingNotes.push(note);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // 2. Delete existing notes for this month (simpler than update for now)
    for (const note of existingNotes) {
      if (signal?.aborted) throw new Error('Operation cancelled');
      await withRetry(() => miro.board.remove(note), signal);
    }

    // 3. Group schedules by date and user
    const schedulesByDateAndUser = new Map<string, Map<string, any[]>>();
    
    if (settings.personalSchedules) {
      for (const [devId, schedules] of Object.entries(settings.personalSchedules)) {
        for (const schedule of schedules) {
          if (schedule.date.startsWith(yearMonth)) {
            if (!schedulesByDateAndUser.has(schedule.date)) {
              schedulesByDateAndUser.set(schedule.date, new Map());
            }
            const dateMap = schedulesByDateAndUser.get(schedule.date)!;
            if (!dateMap.has(devId)) {
              dateMap.set(devId, []);
            }
            dateMap.get(devId)!.push(schedule);
          }
        }
      }
    }

    // 4. Create new notes
    const frame = await withRetry(() => getCalendarFrame(year, month), signal);
    
    for (const [date, userMap] of schedulesByDateAndUser.entries()) {
      let userIndex = 0;
      for (const [devId, schedules] of userMap.entries()) {
        if (signal?.aborted) throw new Error('Operation cancelled');
        
        const dev = settings.devs.find(d => d.id === devId);
        const devName = dev ? dev.name : 'Unknown';
        const role = dev && dev.roleId ? settings.roles.find(r => r.id === dev.roleId)?.name : '';
        
        // Format content
        const lines = [`<strong>${devName}</strong> ${role ? `(${role})` : ''}`];
        
        // Sort schedules by time
        schedules.sort((a, b) => {
            if (a.type === 'fullDayOff') return -1;
            if (b.type === 'fullDayOff') return 1;
            return (a.start || '').localeCompare(b.start || '');
        });

        for (const sch of schedules) {
          if (sch.type === 'fullDayOff') {
            lines.push('終日休暇');
          } else if (sch.type === 'partial' || sch.type === 'nonAgileTask' || sch.type === 'personalErrand') {
             const timeRange = sch.start && sch.end ? `${sch.start}-${sch.end}` : '';
             lines.push(`${timeRange} ${sch.reason || ''}`);
          }
        }
        
        const content = `<p>${lines.join('<br>')}</p>`;
        const position = await calculatePersonalSchedulePosition(date, userIndex);
        
        const note = await withRetry<any>(() => miro.board.createStickyNote({
          content,
          x: position.x,
          y: position.y,
          shape: 'rectangle',
          width: PERSONAL_NOTE_WIDTH, // Fit in right column (2 columns)
          style: {
            fillColor: 'gray', // Distinct color for personal
            fontSize: 10, // Smaller font to fit content
            textAlign: 'left'
          }
        }), signal);
        
        await withRetry(() => note.setMetadata('appType', PERSONAL_SCHEDULE_APP_TYPE), signal);
        await withRetry(() => note.setMetadata('date', date), signal);
        
        if (frame) {
          try {
            await withRetry(() => frame.add(note), signal);
          } catch (e) {}
        }
        
        userIndex++;
      }
    }

  } catch (error) {
    console.error('Error rendering personal schedules:', error);
  }
}

// Rearrange all tasks for a specific month
export async function rearrangeTasksForMonth(yearMonth: string, signal?: AbortSignal): Promise<void> {
  const settings = await loadSettings();
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed month
  
  // 1. Get all sticky notes ONCE
  const stickyNotes = await withRetry<any[]>(() => miro.board.get({ type: 'sticky_note' }), signal);
  const tasksByDate = new Map<string, { note: any, task: Task }[]>();
  
  for (const note of stickyNotes) {
    const metadata = await note.getMetadata(TASK_METADATA_KEY);
    if (metadata) {
      const task = metadata as Task;
      if (task.date && task.date.startsWith(yearMonth)) {
        if (!tasksByDate.has(task.date)) {
          tasksByDate.set(task.date, []);
        }
        tasksByDate.get(task.date)!.push({ note, task });
      }
    }
  }

  // Optimization: Bulk remove all legacy link shapes for the entire board (or just this month's tasks)
  // To be safe and simple, let's fetch all shapes/texts once and remove any that are 'taskLink'
  // This avoids calling removeExistingLinkShapes inside the loop which is very expensive
  try {
      const allShapes = await withRetry<any[]>(() => miro.board.get({ type: 'shape' }), signal);
      const allTexts = await withRetry<any[]>(() => miro.board.get({ type: 'text' }), signal);
      
      const itemsToRemove = [];
      
      for (const shape of allShapes) {
          const appType = await shape.getMetadata('appType');
          if (appType === 'taskLink') itemsToRemove.push(shape);
      }
      for (const text of allTexts) {
          const appType = await text.getMetadata('appType');
          if (appType === 'taskLink') itemsToRemove.push(text);
      }
      
      // Remove in batches to avoid rate limits
      for (const item of itemsToRemove) {
          if (signal?.aborted) throw new Error('Operation cancelled');
          await withRetry(() => miro.board.remove(item), signal);
      }
  } catch (e) {
      console.warn('Failed to cleanup legacy links', e);
  }
  
  // 2. Process each date
  const frame = await withRetry(() => getCalendarFrame(year, month), signal);

  for (const [date, dateNotes] of tasksByDate.entries()) {
     if (signal?.aborted) throw new Error('Operation cancelled');
     
     // Add delay to avoid rate limits
     await sleep(100);

     const tasks = dateNotes.map(dn => dn.task);
     const newPositions = await calculateTaskPositionsForDate(date, tasks);
     
     for (const { note, task } of dateNotes) {
        if (signal?.aborted) throw new Error('Operation cancelled');

        const pos = newPositions.get(task.id);
        if (pos) {
            // Update properties (content, url, etc.)
            // Skip link cleanup because we did it in bulk
            await withRetry(() => updateStickyNoteProperties(note, task, settings, true), signal);

            if (Math.abs(note.x - pos.x) > 1 || Math.abs(note.y - pos.y) > 1) {
                try {
                    note.x = pos.x;
                    note.y = pos.y;
                    await withRetry(() => note.sync(), signal);
                } catch (e: any) {
                    if (e.message && e.message.includes('child of another board item')) {
                        try {
                            // Detach from old parent first
                            await detachFromParent(note, signal);
                            
                            // Move to new position
                            note.x = pos.x;
                            note.y = pos.y;
                            await withRetry(() => note.sync(), signal);
                            
                            // Add to new frame
                            if (frame) {
                                await withRetry(() => frame.add(note), signal);
                            }
                        } catch (retryError) {
                            console.error('Failed to move task in rearrange', retryError);
                        }
                    }
                }
            }

            if (frame) {
                try { await withRetry(() => frame.add(note), signal); } catch (e) {}
            }
        }
     }
  }
  
  // Render personal schedules
  await renderPersonalSchedulesForMonth(yearMonth, signal);
}
