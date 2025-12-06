import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, DevMode } from '../../models/types';
import { loadTasks, createTask, updateTask, deleteTask } from '../../services/tasksService';
import './TasksTab.css';

const TasksTab: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasksData();
  }, []);

  const loadTasksData = async () => {
    setLoading(true);
    const loadedTasks = await loadTasks();
    setTasks(loadedTasks);
    setLoading(false);
  };

  const handleCreateTask = () => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      status: 'Draft',
      title: '新しいタスク',
      summary: '',
      roles: {
        designerIds: [],
        devPlan: {
          phase: 'Draft',
          mode: 'NoDev',
          requiredTrackCount: 0,
          assignedTrackIds: [],
        },
      },
      externalParticipants: [],
      constraints: {
        timeLocked: false,
        rolesLocked: false,
        externalFixed: false,
      },
    };
    setSelectedTask(newTask);
    setIsEditing(true);
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;

    try {
      if (tasks.find(t => t.id === selectedTask.id)) {
        await updateTask(selectedTask);
      } else {
        await createTask(selectedTask);
      }
      await loadTasksData();
      setIsEditing(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteTask(taskId);
        await loadTasksData();
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
          setIsEditing(false);
        }
      } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
      }
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsEditing(false);
  };

  if (loading) {
    return <div>Loading tasks...</div>;
  }

  return (
    <div className="tasks-tab">
      <div className="tasks-list">
        <div className="tasks-header">
          <h2>タスク</h2>
          <button className="btn btn-primary" onClick={handleCreateTask}>
            + 新規タスク
          </button>
        </div>
        
        <div className="task-items">
          {tasks.length === 0 ? (
            <p className="no-tasks">まだタスクがありません。最初のタスクを作成しましょう！</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={`task-item ${selectedTask?.id === task.id ? 'selected' : ''}`}
                onClick={() => handleTaskClick(task)}
              >
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  <span className={`status-badge status-${task.status.toLowerCase()}`}>
                    {task.status}
                  </span>
                  {task.date && <span className="task-date">{task.date}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <div className="task-detail">
          <h3>{isEditing ? 'タスク編集' : 'タスク詳細'}</h3>
          
          {isEditing ? (
            <div className="task-form">
              <div className="form-group">
                <label>タイトル</label>
                <input
                  type="text"
                  value={selectedTask.title}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, title: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>概要</label>
                <textarea
                  rows={3}
                  value={selectedTask.summary}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, summary: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>ステータス</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      status: e.target.value as TaskStatus,
                    })
                  }
                >
                  <option value="Draft">下書き</option>
                  <option value="Planned">計画済み</option>
                  <option value="Scheduled">スケジュール済み</option>
                  <option value="Done">完了</option>
                  <option value="Canceled">キャンセル</option>
                </select>
              </div>

              <div className="form-group">
                <label>日付</label>
                <input
                  type="date"
                  value={selectedTask.date || ''}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, date: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>開始時間（省略可）</label>
                <select
                  value={selectedTask.time?.startTime || ''}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      time: e.target.value ? {
                        startTime: e.target.value,
                        duration: selectedTask.time?.duration,
                      } : undefined,
                    })
                  }
                >
                  <option value="">未設定</option>
                  {Array.from({ length: 109 }, (_, i) => {
                    const totalMinutes = 9 * 60 + i * 5;
                    if (totalMinutes > 18 * 60) return null;
                    const hour = Math.floor(totalMinutes / 60);
                    const min = totalMinutes % 60;
                    const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                    return <option key={time} value={time}>{time}</option>;
                  })}
                </select>
              </div>

              <div className="form-group">
                <label>所要時間（省略可）</label>
                <select
                  value={selectedTask.time?.duration || ''}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      time: e.target.value ? {
                        startTime: selectedTask.time?.startTime,
                        duration: parseInt(e.target.value),
                      } : undefined,
                    })
                  }
                >
                  <option value="">未設定</option>
                  {Array.from({ length: 96 }, (_, i) => {
                    const minutes = (i + 1) * 5;
                    if (minutes > 480) return null;
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const label = hours > 0 
                      ? (mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`)
                      : `${mins}分`;
                    return <option key={minutes} value={minutes}>{label}</option>;
                  })}
                </select>
              </div>

              <div className="form-group">
                <label>外部リンク</label>
                <input
                  type="url"
                  value={selectedTask.externalLink || ''}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      externalLink: e.target.value,
                    })
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="form-group">
                <label>開発モード</label>
                <select
                  value={selectedTask.roles.devPlan.mode}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      roles: {
                        ...selectedTask.roles,
                        devPlan: {
                          ...selectedTask.roles.devPlan,
                          mode: e.target.value as DevMode,
                        },
                      },
                    })
                  }
                >
                  <option value="NoDev">開発なし</option>
                  <option value="Tracks">トラック</option>
                  <option value="AllDev">全開発者</option>
                </select>
              </div>

              {selectedTask.roles.devPlan.mode === 'Tracks' && (
                <div className="form-group">
                  <label>必要トラック数</label>
                  <input
                    type="number"
                    min="0"
                    value={selectedTask.roles.devPlan.requiredTrackCount}
                    onChange={(e) =>
                      setSelectedTask({
                        ...selectedTask,
                        roles: {
                          ...selectedTask.roles,
                          devPlan: {
                            ...selectedTask.roles.devPlan,
                            requiredTrackCount: parseInt(e.target.value) || 0,
                          },
                        },
                      })
                    }
                  />
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleSaveTask}>
                  保存
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsEditing(false);
                    if (!tasks.find(t => t.id === selectedTask.id)) {
                      setSelectedTask(null);
                    }
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="task-view">
              <div className="task-field">
                <strong>タイトル:</strong> {selectedTask.title}
              </div>
              <div className="task-field">
                <strong>概要:</strong> {selectedTask.summary || 'なし'}
              </div>
              <div className="task-field">
                <strong>ステータス:</strong> {selectedTask.status}
              </div>
              <div className="task-field">
                <strong>日付:</strong> {selectedTask.date || '未設定'}
              </div>
              {selectedTask.time?.startTime && (
                <div className="task-field">
                  <strong>開始時間:</strong> {selectedTask.time.startTime}
                </div>
              )}
              {selectedTask.time?.duration && (
                <div className="task-field">
                  <strong>所要時間:</strong> {
                    (() => {
                      const hours = Math.floor(selectedTask.time.duration / 60);
                      const mins = selectedTask.time.duration % 60;
                      return hours > 0 
                        ? (mins > 0 ? `${hours}時間${mins}分` : `${hours}時間`)
                        : `${mins}分`;
                    })()
                  }
                </div>
              )}
              {selectedTask.externalLink && (
                <div className="task-field">
                  <strong>リンク:</strong>{' '}
                  <a href={selectedTask.externalLink} target="_blank" rel="noopener noreferrer">
                    {selectedTask.externalLink}
                  </a>
                </div>
              )}
              <div className="task-field">
                <strong>開発モード:</strong> {selectedTask.roles.devPlan.mode}
              </div>
              {selectedTask.roles.devPlan.mode === 'Tracks' && (
                <div className="task-field">
                  <strong>必要トラック:</strong> {selectedTask.roles.devPlan.requiredTrackCount}
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                  編集
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TasksTab;
