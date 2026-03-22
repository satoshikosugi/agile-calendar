import React, { useState, useEffect } from 'react';
import { Task, Settings, TaskStatus } from '../../models/types';
import { loadTasks, updateTask, deleteTask, loadSettings, saveTasks } from '../../services/storageService';
import './TasksTab.css';

interface TasksTabProps {
  onCreateTask?: () => void;
  onEditTask?: (task: Task) => void;
  onOpenRecurringTasks?: () => void;
}

const TasksTab: React.FC<TasksTabProps> = ({ onCreateTask, onEditTask, onOpenRecurringTasks }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [loadedTasks, loadedSettings] = await Promise.all([
      loadTasks(),
      loadSettings()
    ]);
    // Sort tasks by date asc, then time
    loadedTasks.sort((a, b) => {
        if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
        return (a.time?.startTime || '').localeCompare(b.time?.startTime || '');
    });
    setTasks(loadedTasks);
    setSettings(loadedSettings);
    setLoading(false);
  };

  const handleCreateTask = async () => {
    if (onCreateTask) {
      onCreateTask();
    }
  };

  const handleEditTask = async (task: Task) => {
    if (onEditTask) {
      onEditTask(task);
    }
  };

  const toggleSelect = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === tasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`${selectedTaskIds.size}件のタスクを削除してもよろしいですか？`)) return;
    
    setLoading(true);
    try {
      for (const taskId of selectedTaskIds) {
        await deleteTask(taskId);
      }
      
      // Update local state
      setTasks(prevTasks => prevTasks.filter(t => !selectedTaskIds.has(t.id)));
      setSelectedTaskIds(new Set());
    } catch (error) {
      console.error(error);
      alert('削除中にエラーが発生しました');
      await loadData(); // Reload on error
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    let newStatus: TaskStatus = task.status;
    
    if (task.status === 'Draft') {
        newStatus = 'Planned';
    } else if (task.status === 'Planned') {
        newStatus = 'Draft';
    } else {
        return; 
    }

    // Optimistic update
    const updatedTask = { ...task, status: newStatus };
    setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));

    try {
        await updateTask(updatedTask);
    } catch (error) {
        console.error('Failed to update status', error);
        // Revert
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    }
  };

  const handleBulkDateChange = async () => {
    if (!bulkDate) return;
    if (!confirm(`${selectedTaskIds.size}件のタスクの日付を ${bulkDate} に変更してもよろしいですか？`)) return;

    setLoading(true);
    try {
      const tasksToUpdate: Task[] = [];
      for (const taskId of selectedTaskIds) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          tasksToUpdate.push({ ...task, date: bulkDate });
        }
      }
      
      if (tasksToUpdate.length > 0) {
        for (const task of tasksToUpdate) {
          await updateTask(task);
        }
        
        // Update local state
        setTasks(prevTasks => {
            const newTasks = prevTasks.map(t => {
                const updated = tasksToUpdate.find(u => u.id === t.id);
                return updated ? updated : t;
            });
            
            // Re-sort
            return newTasks.sort((a, b) => {
                if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
                return (a.time?.startTime || '').localeCompare(b.time?.startTime || '');
            });
        });
      }

      setSelectedTaskIds(new Set());
      setBulkDate('');
    } catch (error) {
      console.error(error);
      alert('更新中にエラーが発生しました');
      await loadData(); // Reload on error
    } finally {
      setLoading(false);
    }
  };

  const getParticipantsString = (task: Task) => {
    if (!settings) return '';
    const parts = [];
    
    if (task.roles.pmId) {
        const pm = settings.devs.find(d => d.id === task.roles.pmId);
        if (pm) parts.push(`${pm.name}(PM)`);
    }
    
    if (task.roles.devPlan.mode === 'Tracks') {
        parts.push(`${task.roles.devPlan.assignedTrackIds?.length || 0} Tracks`);
    } else if (task.roles.devPlan.mode === 'AllDev') {
        parts.push('All Dev');
    }

    if (task.roles.designerIds?.length > 0) {
        parts.push(`${task.roles.designerIds.length} Des`);
    }

    return parts.join(', ');
  };

  if (loading) {
    return <div>Loading tasks...</div>;
  }

  return (
    <div className="tasks-tab">
      <div className="tasks-list">
        <div className="tasks-header">
          <h2>タスク一覧</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onOpenRecurringTasks && (
              <button className="btn btn-secondary" onClick={onOpenRecurringTasks}>
                🔄 定期タスク
              </button>
            )}
            <button className="btn btn-primary" onClick={handleCreateTask}>
              + 新規タスク
            </button>
          </div>
        </div>

        <div className="tasks-filter-bar">
            <label className="select-all-label">
                <input 
                    type="checkbox" 
                    checked={tasks.length > 0 && selectedTaskIds.size === tasks.length}
                    onChange={toggleSelectAll}
                />
                すべて選択
            </label>
        </div>

        <div className="task-items">
          {tasks.length === 0 ? (
            <p className="no-tasks">まだタスクがありません。最初のタスクを作成しましょう！</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`task-item ${selectedTaskIds.has(task.id) ? 'selected' : ''}`}
                onClick={() => handleEditTask(task)}
              >
                <div className="task-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input 
                        type="checkbox" 
                        checked={selectedTaskIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                    />
                </div>
                <div className="task-content-wrapper">
                    <div className="task-main-info">
                        <div className="task-title-row">
                            <span className="task-title">{task.title}</span>
                            {task.externalLink && <span className="task-link-icon" title="リンクあり">🔗</span>}
                        </div>
                        <div className="task-meta-row">
                            <span 
                                className={`status-badge status-${task.status.toLowerCase()} clickable`}
                                onClick={(e) => handleStatusToggle(task, e)}
                                title="クリックしてステータスを変更 (ドラフト⇔計画済)"
                            >
                                {{
                                'Draft': 'ドラフト',
                                'Planned': '計画済',
                                'Done': '完了',
                                }[task.status] || task.status}
                            </span>
                            {task.date && <span className="task-date">{task.date}</span>}
                            {task.time?.startTime && (
                                <span className="task-time">
                                    {task.time.startTime}
                                    {task.time.duration ? ` (${task.time.duration}分)` : ''}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="task-sub-info">
                        <span className="task-participants">{getParticipantsString(task)}</span>
                    </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="tasks-footer-actions">
            <div className="bulk-reschedule-group">
                <button 
                    className="btn btn-secondary" 
                    onClick={handleBulkDateChange}
                    disabled={selectedTaskIds.size === 0 || !bulkDate}
                >
                    選択したタスクをリスケ
                </button>
                <input 
                    type="date" 
                    value={bulkDate} 
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="bulk-date-input"
                />
            </div>
             {selectedTaskIds.size > 0 && (
                <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} style={{marginLeft: 'auto'}}>
                  削除
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default TasksTab;
