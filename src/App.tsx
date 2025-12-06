import React, { useState, useEffect } from 'react';
import { Settings, Task } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import TaskForm from './components/TaskForm';
import { getMiro } from './miro';
import './App.css';

type ViewMode = 'menu' | 'tasks' | 'calendar' | 'tracks' | 'settings' | 'task-form';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [miroReady, setMiroReady] = useState(false);
  
  // State for TaskForm navigation
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(undefined);
  const [taskFormMode, setTaskFormMode] = useState<'create' | 'edit'>('create');

  useEffect(() => {
    const init = async () => {
      // Check URL parameters for view mode
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      
      if (modeParam === 'create' || modeParam === 'edit') {
        setViewMode('task-form');
        if (modeParam === 'edit') {
            setTaskFormMode('edit');
            setEditingTaskId(params.get('taskId') || undefined);
        } else {
            setTaskFormMode('create');
        }
      } else if (modeParam && ['tasks', 'calendar', 'tracks', 'settings', 'task-form'].includes(modeParam)) {
        setViewMode(modeParam as ViewMode);
      } else {
        setViewMode('menu');
      }

      try {
        // Initialize Miro SDK first
        const { instance: miroInstance } = await getMiro();
        
        // Check if we're using real Miro or mock
        const isRealMiro = miroInstance && typeof miroInstance.board?.getInfo === 'function';
        setMiroReady(isRealMiro);
        
        if (isRealMiro) {
          console.log('✅ Connected to Miro board');
        } else {
          console.log('📦 Using mock mode - data stored in browser');
        }
        
        // Then load settings
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('❌ Initialization error:', error);
        // Continue with mock data
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);
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

  const openModal = async (mode: ViewMode) => {
    const { instance } = await getMiro();
    // モーダルのサイズはコンテンツに合わせて調整
    let width = 1024;
    let height = 768;

    if (mode === 'task-form') {
        width = 400;
        height = 600;
    } else if (mode === 'settings') {
        width = 800;
        height = 600;
    }

    if (instance && instance.board && instance.board.ui) {
      await instance.board.ui.openModal({
        url: `${import.meta.env.BASE_URL}?mode=${mode}`,
        width,
        height,
        fullscreen: false,
      });
    } else {
        // モックモードやブラウザでのデバッグ用
        window.open(`${import.meta.env.BASE_URL}?mode=${mode}`, '_blank');
    }
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

  const handleCloseTaskForm = async () => {
    // If we are in a modal and came from 'tasks', go back to 'tasks'.
    // If we opened directly as 'task-form', maybe we should close the modal?
    // For now, let's assume we always want to go back to 'tasks' if we are in the app flow.
    // But if the user opened the modal specifically for creating a task (if that's possible), they might want to close.
    // Given the current structure, 'tasks' is the main view for tasks.
    
    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get('mode');
    
    if (initialMode === 'create' || initialMode === 'edit' || initialMode === 'task-form') {
        // If opened directly as form, close the modal
        const { instance } = await getMiro();
        if (instance && instance.board && instance.board.ui) {
            await instance.board.ui.closeModal();
        } else {
            window.close();
        }
    } else {
        // Otherwise go back to tasks list
        setViewMode('tasks');
        setEditingTaskId(undefined);
    }
  };

  if (loading || !settings) {
    return <div className="loading">Miro SDKを初期化中...</div>;
  }

  // メニュー画面
  if (viewMode === 'menu') {
    return (
      <div className="app menu-mode">
        {!miroReady && (
          <div className="mock-banner">
            ⚠️ モックモード
          </div>
        )}
        <div className="menu-container">
          <h1 className="menu-title">Agile Calendar</h1>
          <button className="menu-button" onClick={() => openModal('tasks')}>
            📋 タスク管理
          </button>
          <button className="menu-button" onClick={() => openModal('tracks')}>
            👥 トラック・メンバー設定
          </button>
          <button className="menu-button" onClick={() => openModal('calendar')}>
            📅 カレンダー生成
          </button>
          <button className="menu-button secondary" onClick={() => openModal('settings')}>
            ⚙️ 設定
          </button>
        </div>
      </div>
    );
  }

  // 各機能画面（モーダル内）
  return (
    <div className="app modal-mode">
      {viewMode === 'task-form' && (
        <TaskForm 
          taskId={editingTaskId} 
          mode={taskFormMode} 
          onClose={handleCloseTaskForm} 
        />
      )}
      {viewMode === 'tasks' && (
        <TasksTab 
          onCreateTask={handleCreateTask} 
          onEditTask={handleEditTask} 
        />
      )}
      {viewMode === 'tracks' && (
        <TracksTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
      )}
      {viewMode === 'calendar' && (
        <CalendarTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
      )}
      {viewMode === 'settings' && (
        <SettingsTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
      )}
    </div>
  );
};

export default App;
