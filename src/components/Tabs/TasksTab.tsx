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
      title: 'New Task',
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
          <h2>Tasks</h2>
          <button className="btn btn-primary" onClick={handleCreateTask}>
            + New Task
          </button>
        </div>
        
        <div className="task-items">
          {tasks.length === 0 ? (
            <p className="no-tasks">No tasks yet. Create your first task!</p>
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
          <h3>{isEditing ? 'Edit Task' : 'Task Details'}</h3>
          
          {isEditing ? (
            <div className="task-form">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={selectedTask.title}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, title: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Summary</label>
                <textarea
                  rows={3}
                  value={selectedTask.summary}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, summary: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) =>
                    setSelectedTask({
                      ...selectedTask,
                      status: e.target.value as TaskStatus,
                    })
                  }
                >
                  <option value="Draft">Draft</option>
                  <option value="Planned">Planned</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Done">Done</option>
                  <option value="Canceled">Canceled</option>
                </select>
              </div>

              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={selectedTask.date || ''}
                  onChange={(e) =>
                    setSelectedTask({ ...selectedTask, date: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>Time Range</label>
                <div className="time-inputs">
                  <input
                    type="time"
                    value={selectedTask.time?.start || ''}
                    onChange={(e) =>
                      setSelectedTask({
                        ...selectedTask,
                        time: {
                          start: e.target.value,
                          end: selectedTask.time?.end || '',
                        },
                      })
                    }
                    placeholder="Start"
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={selectedTask.time?.end || ''}
                    onChange={(e) =>
                      setSelectedTask({
                        ...selectedTask,
                        time: {
                          start: selectedTask.time?.start || '',
                          end: e.target.value,
                        },
                      })
                    }
                    placeholder="End"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>External Link</label>
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
                <label>Dev Mode</label>
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
                  <option value="NoDev">No Dev</option>
                  <option value="Tracks">Tracks</option>
                  <option value="AllDev">All Dev</option>
                </select>
              </div>

              {selectedTask.roles.devPlan.mode === 'Tracks' && (
                <div className="form-group">
                  <label>Required Track Count</label>
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
                  Save
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
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="task-view">
              <div className="task-field">
                <strong>Title:</strong> {selectedTask.title}
              </div>
              <div className="task-field">
                <strong>Summary:</strong> {selectedTask.summary || 'N/A'}
              </div>
              <div className="task-field">
                <strong>Status:</strong> {selectedTask.status}
              </div>
              <div className="task-field">
                <strong>Date:</strong> {selectedTask.date || 'Not set'}
              </div>
              {selectedTask.time && (
                <div className="task-field">
                  <strong>Time:</strong> {selectedTask.time.start} - {selectedTask.time.end}
                </div>
              )}
              {selectedTask.externalLink && (
                <div className="task-field">
                  <strong>Link:</strong>{' '}
                  <a href={selectedTask.externalLink} target="_blank" rel="noopener noreferrer">
                    {selectedTask.externalLink}
                  </a>
                </div>
              )}
              <div className="task-field">
                <strong>Dev Mode:</strong> {selectedTask.roles.devPlan.mode}
              </div>
              {selectedTask.roles.devPlan.mode === 'Tracks' && (
                <div className="task-field">
                  <strong>Required Tracks:</strong> {selectedTask.roles.devPlan.requiredTrackCount}
                </div>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
                  Edit
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                >
                  Delete
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
