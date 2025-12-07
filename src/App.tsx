import React, { useState, useEffect, useRef } from 'react';
import { Settings, Task } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import StandupTab from './components/Tabs/StandupTab';
import TaskForm from './components/TaskForm';
import { getMiro } from './miro';
import { handleTaskMove } from './services/tasksService';
import buildInfo from './build-info.json';
import './App.css';

type ViewMode = 'menu' | 'tasks' | 'calendar' | 'tracks' | 'settings' | 'task-form' | 'standup';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [miroReady, setMiroReady] = useState(false);
  
  // State for tracking item movement stability
  const trackedItemsRef = useRef<Map<string, { x: number, y: number, stableCount: number, type: string }>>(new Map());
  
  // State for TaskForm navigation
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(undefined);
  const [taskFormMode, setTaskFormMode] = useState<'create' | 'edit'>('create');
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode | null>(null);
  
  // State for StandupTab persistence
  const [standupDate, setStandupDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    let intervalId: any = null;

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
      } else if (modeParam && ['tasks', 'calendar', 'tracks', 'settings', 'task-form', 'standup'].includes(modeParam)) {
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
          
          // Event-driven architecture to reduce API calls
          // Only poll when items are selected
          const handleSelectionUpdate = async () => {
              const selection = await miroInstance.board.getSelection();
              
              // 1. Check for Calendar Cell Click (Immediate action)
              if (selection.length === 1) {
                  const item = selection[0];
                  try {
                      if (item.type === 'shape' || item.type === 'text') {
                          const appType = await item.getMetadata('appType');
                          if (appType === 'calendarCell') {
                              const date = await item.getMetadata('date');
                              if (date) {
                                  console.log('Calendar cell clicked:', date);
                                  // Open Standup Modal
                                  const width = 1200;
                                  const height = 768;
                                  await miroInstance.board.ui.openModal({
                                      url: `${import.meta.env.BASE_URL}?mode=standup&date=${date}`,
                                      width,
                                      height,
                                      fullscreen: false,
                                  });
                                  
                                  await miroInstance.board.deselect();
                                  return; 
                              }
                          }
                      }
                  } catch (e) {
                      console.error('Error checking metadata:', e);
                  }
              }

              // 2. Manage Polling Loop for Dragging
              if (selection.length > 0) {
                  // Start polling if not running
                  if (!intervalId) {
                      console.log('Selection detected. Starting polling loop...');
                      // Initialize tracking for new selection
                      for (const item of selection) {
                          if (!trackedItemsRef.current.has(item.id)) {
                              trackedItemsRef.current.set(item.id, { 
                                  x: item.x, 
                                  y: item.y, 
                                  stableCount: 0, 
                                  type: item.type 
                              });
                          }
                      }

                      intervalId = setInterval(async () => {
                          try {
                              // Re-fetch selection to get current positions
                              const currentSelection = await miroInstance.board.getSelection();
                              const currentIds = new Set(currentSelection.map((i: any) => i.id));
                              const itemsToMove: any[] = [];

                              // Check tracked items
                              for (const item of currentSelection) {
                                  let tracked = trackedItemsRef.current.get(item.id);
                                  if (!tracked) {
                                      // New item added to selection
                                      tracked = { x: item.x, y: item.y, stableCount: 0, type: item.type };
                                      trackedItemsRef.current.set(item.id, tracked);
                                  } else {
                                      // Check movement
                                      const dx = Math.abs(tracked.x - item.x);
                                      const dy = Math.abs(tracked.y - item.y);
                                      
                                      if (dx < 2 && dy < 2) {
                                          tracked.stableCount++;
                                          // Trigger move if stable for ~1 second
                                          if (tracked.stableCount === 1) { // 1 * 1000ms
                                              if (item.type === 'sticky_note') {
                                                  console.log('Item stable, triggering move:', item.id);
                                                  itemsToMove.push(item);
                                              }
                                          }
                                      } else {
                                          tracked.x = item.x;
                                          tracked.y = item.y;
                                          tracked.stableCount = 0;
                                      }
                                  }
                              }

                              // Handle Deselection (Drop)
                              for (const id of trackedItemsRef.current.keys()) {
                                  if (!currentIds.has(id)) {
                                      const tracked = trackedItemsRef.current.get(id);
                                      if (tracked && tracked.type === 'sticky_note') {
                                          console.log('Item deselected (dropped), triggering move:', id);
                                          itemsToMove.push({ id, type: tracked.type });
                                      }
                                      trackedItemsRef.current.delete(id);
                                  }
                              }

                              if (itemsToMove.length > 0) {
                                  await handleTaskMove(itemsToMove);
                              }

                              // Stop polling if no items selected
                              if (currentSelection.length === 0) {
                                  console.log('No items selected. Stopping polling loop.');
                                  clearInterval(intervalId);
                                  intervalId = null;
                                  trackedItemsRef.current.clear();
                              }

                          } catch (e) {
                              console.error('Error in polling loop:', e);
                              // Safety stop
                              if (intervalId) {
                                  clearInterval(intervalId);
                                  intervalId = null;
                              }
                          }
                      }, 1000);
                  }
              }
          };

          // Register event listener
          // Note: 'selection:update' fires when selection changes
          await miroInstance.board.ui.on('selection:update', handleSelectionUpdate);
          
          // Initial check in case items are already selected
          handleSelectionUpdate();

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

    return () => {
        if (intervalId) clearInterval(intervalId);
    };
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
    } else if (mode === 'standup') {
        width = 1200; // 1024 * 1.15 ≈ 1178 -> 1200
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
    setPreviousViewMode(viewMode);
    setTaskFormMode('create');
    setEditingTaskId(undefined);
    setViewMode('task-form');
  };

  const handleEditTask = (task: Task) => {
    setPreviousViewMode(viewMode);
    setTaskFormMode('edit');
    setEditingTaskId(task.id);
    setViewMode('task-form');
  };

  const handleCloseTaskForm = async () => {
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
        // Otherwise go back to previous view or tasks list
        if (previousViewMode && previousViewMode !== 'task-form') {
            setViewMode(previousViewMode);
        } else {
            setViewMode('tasks');
        }
        setEditingTaskId(undefined);
        setPreviousViewMode(null);
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
          <div style={{ textAlign: 'right', fontSize: '0.8em', color: '#666', marginTop: '-20px', marginBottom: '10px' }}>
            Build: {buildInfo.buildNumber}
          </div>
          <button className="menu-button" onClick={() => openModal('tasks')}>
            📋 タスク管理
          </button>
          <button className="menu-button" onClick={() => openModal('standup')}>
            ⏱️ スタンドアップ
          </button>
          <button className="menu-button" onClick={() => openModal('tracks')}>
            👥 トラック・メンバー設定
          </button>
          <button className="menu-button" onClick={() => openModal('calendar')}>
            📅 カレンダー操作
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
      {viewMode === 'standup' && (
        <StandupTab 
          settings={settings} 
          onSettingsUpdate={handleSettingsUpdate} 
          onEditTask={handleEditTask}
          currentDate={standupDate}
          onDateChange={setStandupDate}
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
