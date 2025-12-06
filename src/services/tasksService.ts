import { Task } from '../models/types';
import { miro } from '../miro';
import { loadSettings } from './settingsService';
import { calculateTaskPosition } from './calendarLayoutService';

const TASK_METADATA_KEY = 'task';

// Visual positioning constants for external link indicators
const LINK_INDICATOR_OFFSET_X = 90;
const LINK_INDICATOR_OFFSET_Y = -60;
const LINK_INDICATOR_SIZE = 24;

// Helper function to remove existing link indicators for a task
async function removeExistingLinkShapes(taskId: string): Promise<void> {
  const allShapes = await miro.board.get({ type: 'shape' });
  const allTexts = await miro.board.get({ type: 'text' });
  
  for (const shape of allShapes) {
    const appType = await shape.getMetadata('appType');
    const linkedTaskId = await shape.getMetadata('taskId');
    if (appType === 'taskLink' && linkedTaskId === taskId) {
      await miro.board.remove(shape);
    }
  }
  
  // Also remove text elements associated with the link
  for (const text of allTexts) {
    const appType = await text.getMetadata('appType');
    const linkedTaskId = await text.getMetadata('taskId');
    if (appType === 'taskLink' && linkedTaskId === taskId) {
      await miro.board.remove(text);
    }
  }
}

// Create a new task as a sticky note on the board
export async function createTask(task: Task): Promise<Task> {
  try {
    // Calculate position based on date and settings
    const settings = await loadSettings();
    const position = calculateTaskPosition(task, settings);

    // Format sticky note content to include key information
    let content = task.title;
    if (task.time && task.time.startTime) {
      content = `${task.time.startTime} ${task.title}`;
    }

    const stickyNote = await miro.board.createStickyNote({
      content: content,
      x: position.x,
      y: position.y,
      width: 150,
      style: {
        fillColor: getTaskColor(task),
      },
    });
    
    await stickyNote.setMetadata('appType', 'task');
    
    // Sanitize task object to remove undefined values which Miro SDK doesn't like
    const cleanTask = JSON.parse(JSON.stringify(task));
    await stickyNote.setMetadata(TASK_METADATA_KEY, cleanTask);
    await stickyNote.sync();
    
    // If task has an external link, create a linked shape next to it
    if (task.externalLink) {
      await createExternalLinkIndicator(stickyNote, task.externalLink);
    }
    
    return task;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

// Helper function to create an external link indicator
async function createExternalLinkIndicator(stickyNote: any, url: string): Promise<void> {
  try {
    // Create a small shape with a link icon next to the sticky note
    const linkShape = await miro.board.createShape({
      shape: 'circle',
      x: stickyNote.x + LINK_INDICATOR_OFFSET_X,
      y: stickyNote.y + LINK_INDICATOR_OFFSET_Y,
      width: LINK_INDICATOR_SIZE,
      height: LINK_INDICATOR_SIZE,
      style: {
        fillColor: '#2196F3',
        borderColor: '#1976D2',
        borderWidth: 2,
      },
    });

    // Create text with link emoji
    const linkText = await miro.board.createText({
      content: '🔗',
      x: stickyNote.x + LINK_INDICATOR_OFFSET_X,
      y: stickyNote.y + LINK_INDICATOR_OFFSET_Y,
      width: LINK_INDICATOR_SIZE,
      style: {
        fontSize: 14,
        textAlign: 'center',
        fillColor: 'transparent',
      },
    });

    // Set metadata to link these elements to the task
    const taskId = (await stickyNote.getMetadata(TASK_METADATA_KEY)).id;
    await linkShape.setMetadata('appType', 'taskLink');
    await linkShape.setMetadata('taskId', taskId);
    await linkShape.setMetadata('url', url);
    await linkText.setMetadata('appType', 'taskLink');
    await linkText.setMetadata('taskId', taskId);
  } catch (error) {
    console.error('Error creating external link indicator:', error);
  }
}

// Helper function to get task color based on status
function getTaskColor(task: Task): string {
  switch (task.status) {
    case 'Draft':
      return '#fef9e7'; // Light yellow
    case 'Planned':
      return '#e8f5e9'; // Light green
    case 'Scheduled':
      return '#e3f2fd'; // Light blue
    case 'Done':
      return '#f5f5f5'; // Gray
    case 'Canceled':
      return '#ffebee'; // Light red
    default:
      return '#ffffff'; // White
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
        let content = task.title;
        if (task.time && task.time.startTime) {
          content = `${task.time.startTime} ${task.title}`;
        }
        note.content = content;
        
        // Update position if date changed
        const settings = await loadSettings();
        const position = calculateTaskPosition(task, settings);
        note.x = position.x;
        note.y = position.y;

        // Update color based on status
        note.style = {
          ...note.style,
          fillColor: getTaskColor(task),
        };

        // Sanitize task object to remove undefined values which Miro SDK doesn't like
        const cleanTask = JSON.parse(JSON.stringify(task));
        await note.setMetadata(TASK_METADATA_KEY, cleanTask);
        await note.sync();

        // Handle external link indicator
        await updateExternalLinkIndicator(note, task);
        
        return;
      }
    }
    
    throw new Error(`Task with id ${task.id} not found`);
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

// Helper function to update external link indicator
async function updateExternalLinkIndicator(stickyNote: any, task: Task): Promise<void> {
  try {
    const taskId = (await stickyNote.getMetadata(TASK_METADATA_KEY)).id;
    
    // Remove existing link indicators using the helper function
    await removeExistingLinkShapes(taskId);

    // Create new link indicator if task has external link
    if (task.externalLink) {
      await createExternalLinkIndicator(stickyNote, task.externalLink);
    }
  } catch (error) {
    console.error('Error updating external link indicator:', error);
  }
}

// Delete a task
export async function deleteTask(taskId: string): Promise<void> {
  try {
    const stickyNotes = await miro.board.get({ type: 'sticky_note' });
    
    for (const note of stickyNotes) {
      const metadata = await note.getMetadata(TASK_METADATA_KEY);
      if (metadata && (metadata as Task).id === taskId) {
        // Remove associated link indicators using the helper function
        await removeExistingLinkShapes(taskId);
        
        // Remove the sticky note
        await miro.board.remove(note);
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
