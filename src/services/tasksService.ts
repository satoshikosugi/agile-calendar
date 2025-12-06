import { Task } from '../models/types';
import { miro } from '../miro';
import { loadSettings } from './settingsService';
import { calculateTaskPosition } from './calendarLayoutService';

const TASK_METADATA_KEY = 'task';

// Create a new task as a sticky note on the board
export async function createTask(task: Task): Promise<Task> {
  try {
    // Calculate position based on date and settings
    const settings = await loadSettings();
    const position = calculateTaskPosition(task, settings);

    const stickyNote = await miro.board.createStickyNote({
      content: task.title,
      x: position.x,
      y: position.y,
      width: 200,
    });
    
    await stickyNote.setMetadata('appType', 'task');
    
    // Sanitize task object to remove undefined values which Miro SDK doesn't like
    const cleanTask = JSON.parse(JSON.stringify(task));
    await stickyNote.setMetadata(TASK_METADATA_KEY, cleanTask);
    await stickyNote.sync();
    
    return task;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Load all tasks from the board
export async function loadTasks(): Promise<Task[]> {
  try {
    const stickyNotes = await miro.board.get({ type: 'sticky_note' });
    const tasks: Task[] = [];
    
    for (const note of stickyNotes) {
      const appType = await note.getMetadata('appType');
      if (appType === 'task') {
        const metadata = await note.getMetadata(TASK_METADATA_KEY);
        if (metadata) {
          tasks.push(metadata as Task);
        }
      } else {
        // Fallback for backward compatibility or if appType wasn't set but TASK_METADATA_KEY exists
        const metadata = await note.getMetadata(TASK_METADATA_KEY);
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
export async function updateTask(task: Task): Promise<void> {
  try {
    const stickyNotes = await miro.board.get({ type: 'sticky_note' });
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata && (metadata as Task).id === task.id) {
        // Update sticky note content
        note.content = task.title;
        
        // Update position if date changed
        const settings = await loadSettings();
        const position = calculateTaskPosition(task, settings);
        note.x = position.x;
        note.y = position.y;

        // Sanitize task object to remove undefined values which Miro SDK doesn't like
        const cleanTask = JSON.parse(JSON.stringify(task));
        await note.setMetadata(TASK_METADATA_KEY, cleanTask);
        await note.sync();
        return;
      }
    }
    
    throw new Error(`Task with id ${task.id} not found`);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Delete a task
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const stickyNotes = await miro.board.get({ type: 'sticky_note' });
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata && (metadata as Task).id === taskId) {
        await note.remove();
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
