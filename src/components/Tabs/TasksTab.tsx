import React, { useState, useEffect } from 'react';
import { Task } from '../../models/types';
import { loadTasks } from '../../services/tasksService';
import { miro } from '../../miro';
import './TasksTab.css';

interface TasksTabProps {
  onCreateTask?: () => void;
  onEditTask?: (task: Task) => void;
}

const TasksTab: React.FC<TasksTabProps> = ({ onCreateTask, onEditTask }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
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

  const handleCreateTask = async () => {
    if (onCreateTask) {
      onCreateTask();
    } else {
      await miro.board.ui.openModal({
        url: `${import.meta.env.BASE_URL}?mode=create`,
        width: 500,
        height: 600,
      });
      // Reload tasks after modal closes
      await loadTasksData();
    }
  };

  const handleEditTask = async (task: Task) => {
    if (onEditTask) {
      onEditTask(task);
    } else {
      await miro.board.ui.openModal({
        url: `${import.meta.env.BASE_URL}?mode=edit&taskId=${task.id}`,
        width: 500,
        height: 600,
      });
      // Reload tasks after modal closes
      await loadTasksData();
    }
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
                className="task-item"
                onClick={() => handleEditTask(task)}
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
    </div>
  );
};

export default TasksTab;
