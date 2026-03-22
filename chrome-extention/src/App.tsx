import React, { useState, useEffect } from 'react';
import { Settings, Task, RecurringTask } from './models/types';
import { loadSettings, saveSettings } from './services/storageService';
import { applyRecurringTasks } from './services/recurringTaskService';
import TasksTab from './components/Tabs/TasksTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import StandupTab from './components/Tabs/StandupTab';
import CalendarTab from './components/Tabs/CalendarTab';
import ToolsTab from './components/Tabs/ToolsTab';
import TaskForm from './components/TaskForm';
import RecurringTaskForm from './components/RecurringTaskForm';
import './App.css';

type TabType = 'tasks' | 'standup' | 'tracks' | 'calendar' | 'tools' | 'settings';
type ViewMode = 'tabs' | 'task-form' | 'recurring-tasks';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [viewMode, setViewMode] = useState<ViewMode>('tabs');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // State for TaskForm navigation
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(undefined);
  const [taskFormMode, setTaskFormMode] = useState<'create' | 'edit'>('create');

  // State for StandupTab persistence
  const [standupDate, setStandupDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const init = async () => {
      try {
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSettingsUpdate = async (newSettings: Settings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  // Task Navigation Handlers
  const handleCreateTask = () => {
    setTaskFormMode('create');
    setEditingTaskId(undefined);
    setViewMode('task-form');
  };

  const handleEditTask = (task: Task) => {
    setTaskFormMode('edit');
    setEditingTaskId(task.id);
    setViewMode('task-form');
  };

  const handleCloseTaskForm = () => {
    setViewMode('tabs');
    setEditingTaskId(undefined);
  };

  const handleSaveRecurringTask = async (task: RecurringTask) => {
    if (!settings) return;

    const existingIndex = (settings.recurringTasks || []).findIndex(t => t.id === task.id);
    let updatedRecurringTasks = [...(settings.recurringTasks || [])];

    if (existingIndex >= 0) {
      updatedRecurringTasks[existingIndex] = task;
    } else {
      updatedRecurringTasks.push(task);
    }

    const newSettings = {
      ...settings,
      recurringTasks: updatedRecurringTasks
    };

    try {
      await handleSettingsUpdate(newSettings);

      const start = new Date(settings.baseMonth + '-01');
      const months = [];
      for (let i = 0; i < settings.viewSpanMonths; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      await applyRecurringTasks(newSettings, months);

      alert('定期タスクを保存しました');
    } catch (error) {
      console.error(error);
      alert('保存に失敗しました');
    }
  };

  const handleReapplyRecurringTasks = async (onProgress?: (message: string) => void) => {
    if (!settings) return;
    try {
      const start = new Date(settings.baseMonth + '-01');
      const months = [];
      for (let i = 0; i < settings.viewSpanMonths; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      await applyRecurringTasks(settings, months, onProgress);
      alert('定期タスクを再適用しました');
    } catch (error) {
      console.error(error);
      alert('再適用に失敗しました');
    }
  };

  const handleDeleteRecurringTask = async (taskId: string) => {
    if (!settings) return;
    const newSettings = {
      ...settings,
      recurringTasks: (settings.recurringTasks || []).filter(t => t.id !== taskId)
    };
    try {
      await handleSettingsUpdate(newSettings);
      alert('定期タスクを削除しました');
    } catch (error) {
      console.error(error);
      alert('削除に失敗しました');
    }
  };

  if (loading || !settings) {
    return <div className="loading">読み込み中...</div>;
  }

  // TaskForm view
  if (viewMode === 'task-form') {
    return (
      <div className="app">
        <TaskForm
          taskId={editingTaskId}
          mode={taskFormMode}
          onClose={handleCloseTaskForm}
        />
      </div>
    );
  }

  // Recurring Tasks view
  if (viewMode === 'recurring-tasks') {
    return (
      <div className="app">
        <RecurringTaskForm
          settings={settings}
          onSave={handleSaveRecurringTask}
          onDelete={handleDeleteRecurringTask}
          onReapply={handleReapplyRecurringTasks}
          onCancel={() => setViewMode('tabs')}
        />
      </div>
    );
  }

  // Main tabbed view
  return (
    <div className="app">
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          📋 タスク
        </button>
        <button
          className={`tab ${activeTab === 'standup' ? 'active' : ''}`}
          onClick={() => setActiveTab('standup')}
        >
          ⏱️ スタンドアップ
        </button>
        <button
          className={`tab ${activeTab === 'tracks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tracks')}
        >
          👥 トラック
        </button>
        <button
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          📅 カレンダー
        </button>
        <button
          className={`tab ${activeTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          🔧 ツール
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ 設定
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'tasks' && (
          <TasksTab
            onCreateTask={handleCreateTask}
            onEditTask={handleEditTask}
            onOpenRecurringTasks={() => setViewMode('recurring-tasks')}
          />
        )}
        {activeTab === 'standup' && (
          <StandupTab
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
            onEditTask={handleEditTask}
            currentDate={standupDate}
            onDateChange={setStandupDate}
          />
        )}
        {activeTab === 'tracks' && (
          <TracksTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
        )}
        {activeTab === 'calendar' && (
          <CalendarTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
        )}
        {activeTab === 'tools' && (
          <ToolsTab settings={settings} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
        )}
      </div>
    </div>
  );
};

export default App;
