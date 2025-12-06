import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, DevMode } from '../models/types';
import { createTask, updateTask, getTask, deleteTask } from '../services/tasksService';
import { miro } from '../miro';
import './TaskForm.css';

interface TaskFormProps {
  taskId?: string;
  mode?: 'create' | 'edit';
  onClose?: () => void;
}

const TaskForm: React.FC<TaskFormProps> = ({ taskId: propTaskId, mode: propMode, onClose }) => {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const init = async () => {
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

  if (loading) return <div>Loading...</div>;
  if (!task) return <div>Error loading task</div>;

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
          <option value="Draft">Draft</option>
          <option value="Planned">Planned</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Done">Done</option>
          <option value="Canceled">Canceled</option>
        </select>
      </div>

      <div className="form-group">
        <label>日付</label>
        <input
          type="date"
          value={task.date || ''}
          onChange={(e) => setTask({ ...task, date: e.target.value })}
        />
      </div>

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
