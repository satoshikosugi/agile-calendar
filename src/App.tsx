import React, { useState, useEffect, useRef } from 'react';
import { Settings, Task, RecurringTask } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import { applyRecurringTasks } from './services/recurringTaskService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import StandupTab from './components/Tabs/StandupTab';
import ToolsTab from './components/Tabs/ToolsTab';
import TaskForm from './components/TaskForm';
import RecurringTaskForm from './components/RecurringTaskForm';
import { getMiro } from './miro';
import { handleTaskMove } from './services/tasksService';
import { debugService } from './services/debugService';
import { withRetry } from './utils/retry';
import buildInfo from './build-info.json';
import './App.css';

type ViewMode = 'menu' | 'tasks' | 'calendar' | 'tracks' | 'settings' | 'task-form' | 'standup' | 'recurring-tasks' | 'tools';

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
  const [showDebug, setShowDebug] = useState(false);
  
  // State for selected board task
  // const [selectedBoardTask, setSelectedBoardTask] = useState<{id: string, title: string} | null>(null);

  useEffect(() => {
    let intervalId: any = null;

    const init = async () => {
      // Check URL parameters for view mode
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      const dateParam = params.get('date');
      
      if (dateParam) {
        setStandupDate(dateParam);
      }
      
      if (modeParam === 'create' || modeParam === 'edit') {
        setViewMode('task-form');
        if (modeParam === 'edit') {
            setTaskFormMode('edit');
            setEditingTaskId(params.get('taskId') || undefined);
        } else {
            setTaskFormMode('create');
        }
      } else if (modeParam && ['tasks', 'calendar', 'tracks', 'settings', 'task-form', 'standup', 'recurring-tasks', 'tools'].includes(modeParam)) {
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
          
          // Check initial selection to see if we should open in edit mode
          // This handles the "Click Plugin Icon while Task Selected" use case
          try {
              const selection = await miroInstance.board.getSelection();
              if (selection.length === 1) {
                  const item = selection[0];
                  if (item.type === 'sticky_note') {
                      const appType = await item.getMetadata('appType');
                      if (appType === 'task') {
                          const task = await item.getMetadata('task');
                          if (task && task.id) {
                              console.log('Plugin opened with task selected:', task.id);
                              // Open modal instead of switching view
                              await openModal('task-form');
                              // We can't pass taskId via URL easily here without reloading, 
                              // but the modal will check selection again or we can use a different approach.
                              // Actually, openModal takes a URL. Let's pass the ID.
                              const width = 400;
                              const height = 600;
                              await miroInstance.board.ui.openModal({
                                  url: `${import.meta.env.BASE_URL}?mode=edit&taskId=${task.id}`,
                                  width,
                                  height,
                                  fullscreen: false,
                              });
                              // Don't set viewMode here, as we opened a modal
                              return; 
                          }
                      }
                  }
              }
          } catch (e) {
              console.warn('Error checking initial selection:', e);
          }
          
          // Event-driven architecture to reduce API calls
          // Only poll when items are selected
          const handleSelectionUpdate = async (event?: any) => {
              let selection: any[] = [];
              
              // Try to get selection from event first (if available and reliable)
              if (event && event.items) {
                  selection = event.items;
              } else {
                  selection = await miroInstance.board.getSelection();
              }

              // Retry logic: If selection is empty, wait a bit and try again
              // This handles the race condition where drag-start fires event before selection is committed
              if (selection.length === 0) {
                  // Retry up to 3 times with increasing delays
                  for (let i = 0; i < 3; i++) {
                      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                      selection = await miroInstance.board.getSelection();
                      if (selection.length > 0) break;
                  }
              }
              
              // Debug log to confirm selection detection
              if (selection.length > 0) {
                  console.log(`Selection update: ${selection.length} items selected`);
              } else {
                  // console.log('Selection update: No items selected');
              }
              
              // 1. Check for Calendar Cell Click (Immediate action)
              if (selection.length === 1) {
                  const item = selection[0];
                  try {
                      if (item.type === 'shape' || item.type === 'text') {
                          const appType = await item.getMetadata('appType');
                          if (appType === 'calendarCell') {
                              const date = await item.getMetadata('date');
                              const isDayNumber = await item.getMetadata('isDayNumber');
                              
                              // Only open standup if clicking the day number button
                              if (date && isDayNumber) {
                                  console.log('Calendar day number clicked:', date);
                                  // Open Standup Modal
                                  const width = 1200;
                                  const height = 768;
                                  await miroInstance.board.ui.openModal({
                                      url: `${import.meta.env.BASE_URL}?mode=standup&date=${date}`,
                                      width,
                                      height,
                                      fullscreen: false,
                                  });
                                  return;
                              }
                          }
                      } /* else if (item.type === 'sticky_note') {
                          const appType = await item.getMetadata('appType');
                          if (appType === 'task') {
                              const task = await item.getMetadata('task');
                              if (task && task.id) {
                                  // Instead of setting selectedBoardTask (which shows banner),
                                  // we can just log it. The user wants popup on CLICK, not selection.
                                  // But Miro doesn't have a "click" event for sticky notes, only selection.
                                  // So "Select" IS "Click".
                                  
                                  // The user said: "When I select a task sticky, the panel shows the edit screen".
                                  // This implies my previous code was doing `setViewMode('task-form')` somewhere.
                                  // But I only see `setSelectedBoardTask` here.
                                  
                                  // Ah, maybe they mean the "Edit" button in the banner?
                                  // "クリックするとパネルがタスク編集画面に切り替わってしまう" -> "When I click [it], the panel switches..."
                                  // If they click the sticky note, it gets selected.
                                  
                                  // If I open the modal immediately upon selection, it might be annoying if they just want to move it.
                                  // But the user asked: "ポップアップでタスク編集画面を出して" (Show task edit screen in popup).
                                  
                                  // Let's keep the banner but change the button action to open modal.
                                  setSelectedBoardTask({ id: task.id, title: task.title });
                                  return;
                              }
                          }
                      } */
                  } catch (e) {
                      console.error('Error checking metadata:', e);
                  }
              }
              
              // Clear selected task if not a single task selection
              // setSelectedBoardTask(null);

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

                      // Keep track of consecutive empty selections to prevent premature stopping
                      let emptySelectionCount = 0;
                      let isPolling = false;
                      let stableCycles = 0;

                      const poll = async () => {
                          if (isPolling) return;
                          isPolling = true;
                          let nextPollDelay = 1000; // Default delay: 1 second

                          try {
                              // Re-fetch selection to get current positions
                              // Use withRetry to handle Rate Limits during drag
                              const currentSelection = await withRetry<any[]>(
                                  () => miroInstance.board.getSelection(), 
                                  undefined, 
                                  'board.getSelection(poll)'
                              );
                              
                              // Handle empty selection grace period
                              if (currentSelection.length === 0) {
                                  emptySelectionCount++;
                                  if (emptySelectionCount < 2) { // Wait for 2 consecutive empty polls (2s)
                                      intervalId = setTimeout(poll, 1000);
                                      return;
                                  }
                                  // If we reached here, it's truly empty (Drop detected)
                                  console.log('No items selected for 2s. Processing drops and stopping loop.');
                                  
                                  const droppedItems: any[] = [];
                                  for (const [id, tracked] of trackedItemsRef.current.entries()) {
                                      if (tracked.type === 'sticky_note') {
                                          droppedItems.push({ 
                                              id, 
                                              type: tracked.type,
                                              x: tracked.x,
                                              y: tracked.y
                                          });
                                      }
                                  }

                                  if (droppedItems.length > 0) {
                                      console.log('Triggering move for dropped items:', droppedItems.length);
                                      await handleTaskMove(droppedItems);
                                  }

                                  intervalId = null;
                                  trackedItemsRef.current.clear();
                                  return; // Stop loop
                              }
                              
                              // Reset counter if we found items
                              emptySelectionCount = 0;

                              const currentIds = new Set(currentSelection.map((i: any) => i.id));
                              const itemsToMove: any[] = [];
                              let hasMovement = false;

                              // Check tracked items
                              for (const item of currentSelection) {
                                  let tracked = trackedItemsRef.current.get(item.id);
                                  if (!tracked) {
                                      // New item added to selection
                                      console.log('Tracking new item:', item.id);
                                      tracked = { x: item.x, y: item.y, stableCount: 0, type: item.type };
                                      trackedItemsRef.current.set(item.id, tracked);
                                      hasMovement = true;
                                  } else {
                                      // Check movement
                                      const dx = Math.abs(tracked.x - item.x);
                                      const dy = Math.abs(tracked.y - item.y);
                                      
                                      // Relaxed stability check: < 5px movement
                                      if (dx < 5 && dy < 5) {
                                          tracked.stableCount++;
                                          // Always update coordinates to ensure we have the latest position on drop
                                          // even if the movement was small
                                          tracked.x = item.x;
                                          tracked.y = item.y;
                                          
                                          // We rely on the 5s debounce in tasksService to handle stability.
                                          // We don't need to trigger move here if stable, 
                                          // because the timer is already running from the last move.
                                      } else {
                                          // console.log(`Item ${item.id} moved: dx=${dx}, dy=${dy}`);
                                          tracked.x = item.x;
                                          tracked.y = item.y;
                                          tracked.stableCount = 0;
                                          hasMovement = true;
                                          
                                          // Trigger move on movement to reset the debounce timer
                                          if (item.type === 'sticky_note') {
                                              itemsToMove.push(item);
                                          }
                                      }
                                  }
                              }

                              // Handle Deselection (Drop)
                              for (const id of trackedItemsRef.current.keys()) {
                                  if (!currentIds.has(id)) {
                                      const tracked = trackedItemsRef.current.get(id);
                                      if (tracked && tracked.type === 'sticky_note') {
                                          console.log('Item deselected (dropped), triggering move:', id);
                                          // Pass last known coordinates to ensure accurate placement
                                          itemsToMove.push({ 
                                              id, 
                                              type: tracked.type,
                                              x: tracked.x,
                                              y: tracked.y
                                          });
                                      }
                                      trackedItemsRef.current.delete(id);
                                      hasMovement = true;
                                  }
                              }

                              // Adaptive Polling Logic
                              if (hasMovement) {
                                  stableCycles = 0;
                                  nextPollDelay = 1000; // 1s polling when moving
                              } else {
                                  stableCycles++;
                                  if (stableCycles > 1) { // Stable for > 1 cycle (1s)
                                      nextPollDelay = 2500; // Slow polling (2.5s) to save API calls
                                      // console.log('Selection stable, slowing down polling...');
                                  }
                              }

                              if (itemsToMove.length > 0) {
                                  console.log('Calling handleTaskMove with', itemsToMove.length, 'items');
                                  await handleTaskMove(itemsToMove);
                              }

                              // Schedule next poll
                              intervalId = setTimeout(poll, nextPollDelay);

                          } catch (e) {
                              console.error('Error in polling loop:', e);
                              // Only stop loop if it's a fatal error, not a transient one (retry handles rate limits)
                              // But if withRetry failed after max retries, we should probably stop to avoid infinite loop
                              if (intervalId) {
                                  clearTimeout(intervalId);
                                  intervalId = null;
                              }
                              // Clear tracking to prevent stale state
                              trackedItemsRef.current.clear();
                          } finally {
                              isPolling = false;
                          }
                      };
                      
                      // Start the loop
                      poll();
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
        if (intervalId) clearTimeout(intervalId);
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
    } else if (mode === 'recurring-tasks') {
        width = 600;
        height = 800;
    } else if (mode === 'settings') {
        width = 800;
        height = 600;
    } else if (mode === 'standup') {
        width = 1320; // Increased by 10%
        height = 920; // Increased by 20%
    } else if (mode === 'tools') {
        width = 900;
        height = 700;
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
      
      // Apply recurring tasks immediately
      const start = new Date(settings.baseMonth + '-01');
      const months = [];
      for (let i = 0; i < settings.viewSpanMonths; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      await applyRecurringTasks(newSettings, months);

      alert('定期タスクを保存し、カレンダーに反映しました');
      
      // Close modal if opened as modal, or go back to menu
      const params = new URLSearchParams(window.location.search);
      const initialMode = params.get('mode');
      if (initialMode === 'recurring-tasks') {
          const { instance } = await getMiro();
          if (instance && instance.board && instance.board.ui) {
              await instance.board.ui.closeModal();
          } else {
              window.close();
          }
      }
      // Note: If not modal mode, we stay in the list view (handled by RecurringTaskForm internal state)
      // But if we want to go back to menu, we can. 
      // However, RecurringTaskForm now has a list view, so we probably want to stay there?
      // The RecurringTaskForm component calls onSave then switches to list view internally.
      // So we don't need to change viewMode here unless we want to exit the whole feature.
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
        {/* selectedBoardTask && (
            <div className="selected-task-banner" style={{
                backgroundColor: '#e3f2fd',
                padding: '10px',
                marginBottom: '15px',
                borderRadius: '4px',
                border: '1px solid #2196f3',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}>
                    <strong>選択中:</strong> {selectedBoardTask.title}
                </div>
                <button 
                    className="btn btn-sm btn-primary"
                    onClick={async () => {
                        // Open in modal instead of switching view
                        const width = 400;
                        const height = 600;
                        const { instance } = await getMiro();
                        if (instance) {
                            await instance.board.ui.openModal({
                                url: `${import.meta.env.BASE_URL}?mode=edit&taskId=${selectedBoardTask.id}`,
                                width,
                                height,
                                fullscreen: false,
                            });
                        }
                    }}
                >
                    編集（ポップアップ）
                </button>
            </div>
        ) */}
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
          <button className="menu-button" onClick={() => openModal('recurring-tasks')}>
            🔄 定期タスク登録
          </button>
          <button className="menu-button" onClick={() => openModal('calendar')}>
            📅 カレンダー操作
          </button>
          <button className="menu-button" onClick={() => openModal('tools')}>
            🔧 便利ツール
          </button>
          <button className="menu-button secondary" onClick={() => openModal('settings')}>
            ⚙️ 設定
          </button>
          <button className="menu-button secondary" onClick={() => setShowDebug(true)}>
            🐞 デバッグ情報
          </button>
        </div>
        {showDebug && (
            <div className="debug-overlay" onClick={() => setShowDebug(false)}>
                <div className="debug-content" onClick={e => e.stopPropagation()}>
                    <h2>API Statistics</h2>
                    <pre>{JSON.stringify(debugService.getStats(), null, 2)}</pre>
                    <div className="debug-actions">
                        <button onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(debugService.getStats(), null, 2));
                            alert('Copied to clipboard!');
                        }}>Copy</button>
                        <button onClick={() => setShowDebug(false)}>Close</button>
                        <button onClick={() => { debugService.reset(); setShowDebug(false); }}>Reset</button>
                    </div>
                </div>
            </div>
        )}
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
      {viewMode === 'recurring-tasks' && (
        <RecurringTaskForm 
          settings={settings}
          onSave={handleSaveRecurringTask} 
          onDelete={handleDeleteRecurringTask}
          onReapply={handleReapplyRecurringTasks}
          onCancel={() => setViewMode('menu')} 
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
      {viewMode === 'tools' && (
        <ToolsTab />
      )}
      {viewMode === 'settings' && (
        <SettingsTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
      )}
    </div>
  );
};

export default App;
