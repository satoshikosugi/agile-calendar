import { Settings, Task } from '../models/types';

const SETTINGS_KEY = 'agile-calendar-settings';
const TASKS_KEY = 'agile-calendar-tasks';

const getDefaultSettings = (): Settings => ({
  baseMonth: new Date().toISOString().substring(0, 7),
  viewSpanMonths: 3,
  roles: [
    { id: 'role-pm', name: 'PM', color: '#ff9999' },
    { id: 'role-dev', name: 'Dev', color: '#99ccff' }
  ],
  devs: [],
  tracks: [],
  externalTeams: [],
  projectHolidays: [],
  personalSchedules: {},
  dailyTrackAssignments: {},
  dailyAssignmentStatus: {},
  breakTime: {
    startTime: '12:30',
    duration: 60
  },
  recurringTasks: [],
  miroApiToken: '',
  miroBoardId: '',
});

const isChromeExtension = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
};

async function getFromStorage<T>(key: string): Promise<T | null> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] ?? null);
      });
    });
  } else {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}

async function setToStorage<T>(key: string, value: T): Promise<void> {
  if (isChromeExtension()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }
}

// Settings
export async function loadSettings(): Promise<Settings> {
  const stored = await getFromStorage<Settings>(SETTINGS_KEY);
  if (stored) {
    // Ensure required roles exist (migration)
    const defaultRoles = getDefaultSettings().roles;
    if (!stored.roles) {
      stored.roles = [...defaultRoles];
    } else {
      const pmExists = stored.roles.some(r => r.id === 'role-pm');
      if (!pmExists) {
        const pmRole = defaultRoles.find(r => r.id === 'role-pm');
        if (pmRole) stored.roles.push(pmRole);
      }
      const devExists = stored.roles.some(r => r.id === 'role-dev');
      if (!devExists) {
        const devRole = defaultRoles.find(r => r.id === 'role-dev');
        if (devRole) stored.roles.push(devRole);
      }
    }
    if (!stored.recurringTasks) stored.recurringTasks = [];
    if (!stored.personalSchedules) stored.personalSchedules = {};
    if (!stored.dailyTrackAssignments) stored.dailyTrackAssignments = {};
    if (!stored.dailyAssignmentStatus) stored.dailyAssignmentStatus = {};
    if (!stored.devs) stored.devs = [];
    if (!stored.tracks) stored.tracks = [];
    if (!stored.roles) stored.roles = getDefaultSettings().roles;
    if (!stored.externalTeams) stored.externalTeams = [];
    if (!stored.projectHolidays) stored.projectHolidays = [];
    return stored;
  }
  return getDefaultSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setToStorage(SETTINGS_KEY, settings);
}

// Tasks
export async function loadTasks(): Promise<Task[]> {
  const stored = await getFromStorage<Task[]>(TASKS_KEY);
  return stored || [];
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await setToStorage(TASKS_KEY, tasks);
}

export async function createTask(task: Task): Promise<Task> {
  const tasks = await loadTasks();
  const newTask = { ...task, id: task.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` };
  tasks.push(newTask);
  await saveTasks(tasks);
  return newTask;
}

export async function updateTask(updatedTask: Task): Promise<void> {
  const tasks = await loadTasks();
  const index = tasks.findIndex(t => t.id === updatedTask.id);
  if (index >= 0) {
    tasks[index] = updatedTask;
    await saveTasks(tasks);
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  const tasks = await loadTasks();
  const filtered = tasks.filter(t => t.id !== taskId);
  await saveTasks(filtered);
}

export async function getTask(taskId: string): Promise<Task | null> {
  const tasks = await loadTasks();
  return tasks.find(t => t.id === taskId) || null;
}
