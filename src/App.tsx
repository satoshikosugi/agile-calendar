import React, { useState, useEffect, useRef } from 'react';
import { Settings, Task, RecurringTask } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import { applyRecurringTasks } from './services/recurringTaskService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import StandupTab from './components/Tabs/StandupTab';
import TaskForm from './components/TaskForm';
import RecurringTaskForm from './components/RecurringTaskForm';
import { getMiro } from './miro';
import { handleTaskMove } from './services/tasksService';
import { debugService } from './services/debugService';
import { withRetry } from './utils/retry';
import buildInfo from './build-info.json';
import './App.css';

type ViewMode = 'menu' | 'tasks' | 'calendar' | 'tracks' | 'settings' | 'task-form' | 'standup' | 'recurring-tasks';

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
      // ビューモードのURLパラメータを確認
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
      } else if (modeParam && ['tasks', 'calendar', 'tracks', 'settings', 'task-form', 'standup', 'recurring-tasks'].includes(modeParam)) {
        setViewMode(modeParam as ViewMode);
      } else {
        setViewMode('menu');
      }

      try {
        // まずMiro SDKを初期化
        const { instance: miroInstance } = await getMiro();
        
        // 実際のMiroを使用しているかモックかを確認
        const isRealMiro = miroInstance && typeof miroInstance.board?.getInfo === 'function';
        setMiroReady(isRealMiro);
        
        if (isRealMiro) {
          console.log('✅ Miroボードに接続しました');
          
          // 初期選択を確認して編集モードで開くべきかチェック
          // これは「タスク選択中にプラグインアイコンをクリック」のユースケースを処理する
          try {
              const selection = await miroInstance.board.getSelection();
              if (selection.length === 1) {
                  const item = selection[0];
                  if (item.type === 'sticky_note') {
                      const appType = await item.getMetadata('appType');
                      if (appType === 'task') {
                          const task = await item.getMetadata('task');
                          if (task && task.id) {
                              console.log('タスクが選択された状態でプラグインが開かれました:', task.id);
                              // ビューを切り替える代わりにモーダルを開く
                              await openModal('task-form');
                              // リロードせずにURLでtaskIdを渡すのは難しいが、
                              // モーダルが再度選択を確認するか、別のアプローチを使用できる
                              // 実際には、openModalはURLを受け取るので、IDを渡す
                              const width = 400;
                              const height = 600;
                              await miroInstance.board.ui.openModal({
                                  url: `${import.meta.env.BASE_URL}?mode=edit&taskId=${task.id}`,
                                  width,
                                  height,
                                  fullscreen: false,
                              });
                              // モーダルを開いたのでviewModeは設定しない
                              return; 
                          }
                      }
                  }
              }
          } catch (e) {
              console.warn('初期選択の確認中にエラーが発生しました:', e);
          }
          
          // API呼び出しを削減するためのイベント駆動アーキテクチャ
          // アイテムが選択されているときのみポーリング
          const handleSelectionUpdate = async (event?: any) => {
              let selection: any[] = [];
              
              // 最初にイベントから選択を取得する（利用可能で信頼できる場合）
              if (event && event.items) {
                  selection = event.items;
              } else {
                  selection = await miroInstance.board.getSelection();
              }

              // リトライロジック: 選択が空の場合、少し待って再試行
              // これはドラッグ開始イベントが選択がコミットされる前に発火する競合状態を処理する
              if (selection.length === 0) {
                  // 遅延を増やしながら最大3回再試行
                  for (let i = 0; i < 3; i++) {
                      await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                      selection = await miroInstance.board.getSelection();
                      if (selection.length > 0) break;
                  }
              }
              
              // 選択検出を確認するためのデバッグログ
              if (selection.length > 0) {
                  console.log(`選択更新: ${selection.length}個のアイテムが選択されました`);
              } else {
                  // console.log('選択更新: アイテムが選択されていません');
              }
              
              // 1. カレンダーセルのクリックを確認（即座のアクション）
              if (selection.length === 1) {
                  const item = selection[0];
                  try {
                      if (item.type === 'shape' || item.type === 'text') {
                          const appType = await item.getMetadata('appType');
                          if (appType === 'calendarCell') {
                              const date = await item.getMetadata('date');
                              const isDayNumber = await item.getMetadata('isDayNumber');
                              
                              // 日付番号ボタンをクリックした場合のみスタンドアップを開く
                              if (date && isDayNumber) {
                                  console.log('カレンダーの日付番号がクリックされました:', date);
                                  // スタンドアップモーダルを開く
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
                      }
                  } catch (e) {
                      console.error('メタデータの確認中にエラーが発生しました:', e);
                  }
              }
              
              // 2. ドラッグのためのポーリングループを管理
              if (selection.length > 0) {
                  // 実行中でない場合はポーリングを開始
                  if (!intervalId) {
                      console.log('選択を検出しました。ポーリングループを開始します...');
                      // 新しい選択の追跡を初期化
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

                      intervalId = setInterval(async () => {
                          if (isPolling) return;
                          isPolling = true;
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
                                  if (emptySelectionCount < 5) { // 5回連続の空のポーリング（250ms）を待つ
                                      return;
                                  }
                                  // ここに到達した場合、本当に空（ドロップ検出）
                                  console.log('250msの間アイテムが選択されていません。ドロップを処理してループを停止します。');
                                  
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
                                      console.log('ドロップされたアイテムの移動をトリガーします:', droppedItems.length);
                                      await handleTaskMove(droppedItems);
                                  }

                                  clearInterval(intervalId);
                                  intervalId = null;
                                  trackedItemsRef.current.clear();
                                  return;
                              }
                              
                              // アイテムが見つかった場合はカウンターをリセット
                              emptySelectionCount = 0;

                              const currentIds = new Set(currentSelection.map((i: any) => i.id));
                              const itemsToMove: any[] = [];

                              // 追跡されたアイテムを確認
                              for (const item of currentSelection) {
                                  let tracked = trackedItemsRef.current.get(item.id);
                                  if (!tracked) {
                                      // 新しいアイテムが選択に追加された
                                      console.log('新しいアイテムを追跡します:', item.id);
                                      tracked = { x: item.x, y: item.y, stableCount: 0, type: item.type };
                                      trackedItemsRef.current.set(item.id, tracked);
                                  } else {
                                      // 移動を確認
                                      const dx = Math.abs(tracked.x - item.x);
                                      const dy = Math.abs(tracked.y - item.y);
                                      
                                      // 緩和された安定性チェック: 5px未満の移動
                                      if (dx < 5 && dy < 5) {
                                          tracked.stableCount++;
                                          // 移動が小さくても、ドロップ時に最新の位置を確保するため常に座標を更新
                                          tracked.x = item.x;
                                          tracked.y = item.y;

                                          // console.log(`アイテム ${item.id} 安定カウント: ${tracked.stableCount}`);
                                          // 約1秒間安定している場合に移動をトリガー（4 * 250ms = 1000ms）
                                          if (tracked.stableCount === 4) { 
                                              if (item.type === 'sticky_note') {
                                                  console.log('アイテムが安定しています、移動をトリガーします:', item.id);
                                                  itemsToMove.push(item);
                                              }
                                          }
                                      } else {
                                          // console.log(`アイテム ${item.id} が移動しました: dx=${dx}, dy=${dy}`);
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
                                          // Pass last known coordinates to ensure accurate placement
                                          itemsToMove.push({ 
                                              id, 
                                              type: tracked.type,
                                              x: tracked.x,
                                              y: tracked.y
                                          });
                                      }
                                      trackedItemsRef.current.delete(id);
                                  }
                              }

                              if (itemsToMove.length > 0) {
                                  console.log('Calling handleTaskMove with', itemsToMove.length, 'items');
                                  await handleTaskMove(itemsToMove);
                              }

                              // Stop polling logic moved to top of loop with grace period

                          } catch (e) {
                              console.error('Error in polling loop:', e);
                              // Only stop loop if it's a fatal error, not a transient one (retry handles rate limits)
                              // But if withRetry failed after max retries, we should probably stop to avoid infinite loop
                              if (intervalId) {
                                  clearInterval(intervalId);
                                  intervalId = null;
                              }
                              // Clear tracking to prevent stale state
                              trackedItemsRef.current.clear();
                          } finally {
                              isPolling = false;
                          }
                      }, 250); // Poll every 250ms to avoid Rate Limits
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
    } else if (mode === 'recurring-tasks') {
        width = 600;
        height = 800;
    } else if (mode === 'settings') {
        width = 800;
        height = 600;
    } else if (mode === 'standup') {
        width = 1320; // Increased by 10%
        height = 920; // Increased by 20%
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
      {viewMode === 'settings' && (
        <SettingsTab settings={settings} onSettingsUpdate={handleSettingsUpdate} />
      )}
    </div>
  );
};

export default App;
