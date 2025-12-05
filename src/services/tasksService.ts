import { Task } from '../models/types';
import { miro } from '../miro';

const TASK_TAG = 'agile-calendar-task';
const TASK_METADATA_KEY = 'task';

// Create a new task as a sticky note on the board
export async function createTask(task: Task): Promise<Task> {
  try {
    const stickyNote = await miro.board.createStickyNote({
      content: task.title,
      x: 0,
      y: 0,
      width: 200,
    });
    
    await stickyNote.setMetadata(TASK_METADATA_KEY, task);
    await stickyNote.sync();
    
    // Tag it for easy finding
    const currentTags = stickyNote.tags || [];
    stickyNote.tags = [...currentTags, TASK_TAG];
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
    const stickyNotes = await miro.board.get({ type: 'sticky_note', tags: [TASK_TAG] });
    const tasks: Task[] = [];
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata) {
        tasks.push(metadata as Task);
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
    const stickyNotes = await miro.board.get({ type: 'sticky_note', tags: [TASK_TAG] });
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata && (metadata as Task).id === task.id) {
        // Update sticky note content
        note.content = task.title;
        await note.setMetadata(TASK_METADATA_KEY, task);
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
    const stickyNotes = await miro.board.get({ type: 'sticky_note', tags: [TASK_TAG] });
    
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
    const stickyNotes = await miro.board.get({ type: 'sticky_note', tags: [TASK_TAG] });
    
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
