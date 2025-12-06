import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, DevMode, Settings } from '../models/types';
import { createTask, updateTask, getTask, deleteTask } from '../services/tasksService';
import { loadSettings } from '../services/settingsService';
import { miro } from '../miro';
import './TaskForm.css';

interface TaskFormProps {
  taskId?: string;
  mode?: 'create' | 'edit';
  onClose?: () => void;
}

// Helper to generate time options (09:00 - 18:00, 5 min intervals)
const generateTimeOptions = () => {
  const options = [];
  for (let h = 9; h <= 18; h++) {
    for (let m = 0; m < 60; m += 5) {
      if (h === 18 && m > 0) break;
      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      options.push(time);
    }
  }
  return options;
};

// Helper to generate duration options (5 min - 480 min, 5 min intervals)
const generateDurationOptions = () => {
  const options = [];
  for (let m = 5; m <= 480; m += 5) {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    let label = '';
    if (hours > 0) label += `${hours}時間`;
    if (mins > 0) label += `${mins}分`;
    options.push({ value: m, label });
  }
  return options;
};

const TaskForm: React.FC<TaskFormProps> = ({ taskId: propTaskId, mode: propMode, onClose }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const init = async () => {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);

      const params = new URLSearchParams(window.location.search);
      const taskId = propTaskId || params.get('taskId');
      const mode = propMode || params.get('mode');

      if (mode === 'create') {
        setIsNew(true);
        setTask({
          id: `task-${Date.now()}`,
          status: 'Draft',
          title: '新しいタスク',
          summary: '',
          roles: {
            pmId: undefined,
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
          time: {
            startTime: undefined,
            duration: undefined
          }
        });
      } else if (taskId) {
        const loadedTask = await getTask(taskId);
        if (loadedTask) {
          setTask(loadedTask);
        } else {
          alert('Task not found');
          handleClose();
        }
      }
      setLoading(false);
    };
    init();
  }, [propTaskId, propMode]);

  const handleClose = async () => {
    if (onClose) {
      onClose();
    } else {
      await miro.board.ui.closeModal();
    }
  };

  const handleSave = async () => {
    if (!task) return;

    try {
      if (isNew) {
        await createTask(task);
      } else {
        await updateTask(task);
      }
      await handleClose();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task');
    }
  };

  const handleCancel = async () => {
    await handleClose();
  };

  const handleDelete = async () => {
    if (!task || isNew) return;
    if (confirm('このタスクを削除してもよろしいですか？')) {
      try {
        await deleteTask(task.id);
        await handleClose();
      } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
      }
    }
  };

  const handleDesignerChange = (devId: string, checked: boolean) => {
    if (!task) return;
    const currentDesigners = task.roles.designerIds || [];
    let newDesigners;
    if (checked) {
      newDesigners = [...currentDesigners, devId];
    } else {
      newDesigners = currentDesigners.filter(id => id !== devId);
    }
    setTask({
      ...task,
      roles: {
        ...task.roles,
        designerIds: newDesigners
      }
    });
  };

  if (loading) return <div>Loading...</div>;
  if (!task || !settings) return <div>Error loading task</div>;

  // Filter devs by role
  const pmDevs = settings.devs.filter(d => d.roleId === 'role-pm');
  const designerRole = settings.roles.find(r => r.name === 'Designer');
  const designerDevs = designerRole 
    ? settings.devs.filter(d => d.roleId === designerRole.id)
    : settings.devs.filter(d => d.roleId !== 'role-pm' && d.roleId !== 'role-dev');

  const timeOptions = generateTimeOptions();
  const durationOptions = generateDurationOptions();

  return (
    <div className="task-form">
      <h2>{isNew ? '新規タスク作成' : 'タスク編集'}</h2>
      
      <div className="form-group">
        <label>タイトル</label>
        <input
          type="text"
          value={task.title}
          onChange={(e) => setTask({ ...task, title: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>概要</label>
        <textarea
          value={task.summary}
          onChange={(e) => setTask({ ...task, summary: e.target.value })}
        />
      </div>

        <div className="form-group">
          <label>ステータス</label>
          <select
            value={task.status}
            onChange={(e) => setTask({ ...task, status: e.target.value as TaskStatus })}
          >
            <option value="Draft">下書き</option>
            <option value="Planned">計画済</option>
            <option value="Scheduled">確定済</option>
            <option value="Done">完了</option>
            <option value="Canceled">中止</option>
          </select>
        </div>      <div className="form-row">
        <div className="form-group">
            <label>日付</label>
            <input
            type="date"
            value={task.date || ''}
            onChange={(e) => setTask({ ...task, date: e.target.value })}
            />
        </div>
        <div className="form-group">
            <label>開始時刻</label>
            <select
                value={task.time?.startTime || ''}
                onChange={(e) => setTask({ 
                    ...task, 
                    time: { ...task.time, startTime: e.target.value } 
                })}
            >
                <option value="">未定</option>
                {timeOptions.map(t => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>
        </div>
        <div className="form-group">
            <label>所要時間</label>
            <select
                value={task.time?.duration || ''}
                onChange={(e) => setTask({ 
                    ...task, 
                    time: { ...task.time, duration: parseInt(e.target.value) || undefined } 
                })}
            >
                <option value="">未定</option>
                {durationOptions.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                ))}
            </select>
        </div>
      </div>

      <div className="form-section">
        <h3>ロール割り当て</h3>
        
        <div className="form-group">
          <label>PM</label>
          <select
            value={task.roles.pmId || ''}
            onChange={(e) => setTask({
              ...task,
              roles: { ...task.roles, pmId: e.target.value || undefined }
            })}
          >
            <option value="">未選択</option>
            {pmDevs.map(dev => (
              <option key={dev.id} value={dev.id}>{dev.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Designers</label>
          <div className="checkbox-group">
            {designerDevs.length > 0 ? designerDevs.map(dev => (
              <label key={dev.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={(task.roles.designerIds || []).includes(dev.id)}
                  onChange={(e) => handleDesignerChange(dev.id, e.target.checked)}
                />
                {dev.name}
              </label>
            )) : <p className="no-data">Designer候補がいません</p>}
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>外部チーム連携</h3>
        <div className="form-group">
          <div className="checkbox-group">
            {settings.externalTeams.length > 0 ? settings.externalTeams.map(team => {
              const participant = task.externalParticipants.find(p => p.teamId === team.id);
              const isSelected = !!participant;
              
              return (
                <div key={team.id} className="external-team-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Add
                          setTask({
                            ...task,
                            externalParticipants: [
                              ...task.externalParticipants,
                              { teamId: team.id, required: false, timeFixed: false }
                            ]
                          });
                        } else {
                          // Remove
                          setTask({
                            ...task,
                            externalParticipants: task.externalParticipants.filter(p => p.teamId !== team.id)
                          });
                        }
                      }}
                    />
                    {team.name}
                  </label>
                  
                  {isSelected && (
                    <div className="external-team-options">
                      <label className="option-label">
                        <input
                          type="checkbox"
                          checked={participant?.required || false}
                          onChange={(e) => {
                            const updated = task.externalParticipants.map(p => 
                              p.teamId === team.id ? { ...p, required: e.target.checked } : p
                            );
                            setTask({ ...task, externalParticipants: updated });
                          }}
                        />
                        必須
                      </label>
                      <label className="option-label">
                        <input
                          type="checkbox"
                          checked={participant?.timeFixed || false}
                          onChange={(e) => {
                            const updated = task.externalParticipants.map(p => 
                              p.teamId === team.id ? { ...p, timeFixed: e.target.checked } : p
                            );
                            setTask({ ...task, externalParticipants: updated });
                          }}
                        />
                        時間固定
                      </label>
                    </div>
                  )}
                </div>
              );
            }) : <p className="no-data">外部チームが設定されていません</p>}
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>開発計画</h3>
        <div className="form-group">
          <label>開発モード</label>
          <select
            value={task.roles.devPlan.mode}
            onChange={(e) =>
              setTask({
                ...task,
                roles: {
                  ...task.roles,
                  devPlan: {
                    ...task.roles.devPlan,
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

        {task.roles.devPlan.mode === 'Tracks' && (
          <div className="form-group">
            <label>必要トラック数</label>
            <input
              type="number"
              min="0"
              value={task.roles.devPlan.requiredTrackCount}
              onChange={(e) =>
                setTask({
                  ...task,
                  roles: {
                    ...task.roles,
                    devPlan: {
                      ...task.roles.devPlan,
                      requiredTrackCount: parseInt(e.target.value) || 0,
                    },
                  },
                })
              }
            />
          </div>
        )}
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          保存
        </button>
        {!isNew && (
          <button 
            className="btn btn-danger" 
            onClick={handleDelete}
          >
            削除
          </button>
        )}
        <button className="btn btn-secondary" onClick={handleCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
};

export default TaskForm;
