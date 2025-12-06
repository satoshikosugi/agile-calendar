import React, { useState, useEffect } from 'react';
import { Task, Settings, DevMode } from '../../models/types';
import { loadTasks, updateTask } from '../../services/tasksService';
import { WORKING_START_MIN, WORKING_END_MIN, parseTime, formatTime, getDevEvents } from '../../services/scheduleService';
import Timetable, { TimetableColumnGroup } from '../Timetable';
import './StandupTab.css';

interface StandupTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
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

const StandupTab: React.FC<StandupTabProps> = ({ settings }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [filterMode] = useState<'day' | 'week'>('day');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    loadTasksData();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTaskId(null);
        return;
      }

      if (!selectedTaskId) return;

      const task = tasks.find(t => t.id === selectedTaskId);
      if (!task || !task.time?.startTime) return;

      const currentMins = parseTime(task.time.startTime);
      const duration = task.time.duration || 30;
      let newMins = currentMins;
      const direction = e.key === 'ArrowUp' ? -5 : e.key === 'ArrowDown' ? 5 : 0;

      if (direction === 0) return;
      e.preventDefault();

      // Determine confirmed participants
      const confirmedDevIds = new Set<string>();
      if (task.roles.pmId) confirmedDevIds.add(task.roles.pmId);
      task.roles.designerIds?.forEach(id => confirmedDevIds.add(id));
      if (task.roles.devPlan.mode === 'AllDev' || task.roles.devPlan.mode === 'Tracks') {
        const pmDevs = settings.devs.filter(d => d.roleId === 'role-pm');
        const designerRole = settings.roles.find(r => r.name.toLowerCase() === 'designer' || r.name === 'デザイナー');
        const designerDevs = designerRole ? settings.devs.filter(d => d.roleId === designerRole.id) : [];
        const otherDevs = settings.devs.filter(d => !pmDevs.includes(d) && !designerDevs.includes(d));
        otherDevs.forEach(d => confirmedDevIds.add(d.id));
      }

      // Find next available slot
      let testMins = currentMins + direction;
      let found = false;
      
      // Limit search to avoid infinite loop (e.g. 100 steps)
      for (let i = 0; i < 100; i++) {
        if (testMins < WORKING_START_MIN || testMins > WORKING_END_MIN - duration) break;

        let hasConflict = false;
        const testEndMins = testMins + duration;

        for (const devId of confirmedDevIds) {
          const devEvents = getDevEvents(filterDate, devId, tasks, settings);
          for (const event of devEvents) {
            if (event.id === selectedTaskId) continue;
            if (testMins < event.end && testEndMins > event.start) {
              hasConflict = true;
              break;
            }
          }
          if (hasConflict) break;
        }

        if (!hasConflict) {
          newMins = testMins;
          found = true;
          break;
        }

        testMins += direction;
      }

      if (found && newMins !== currentMins) {
        handleTimeUpdate(selectedTaskId, { startTime: formatTime(newMins) });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTaskId, tasks, settings, filterDate]);

  const loadTasksData = async () => {
    setLoading(true);
    const loadedTasks = await loadTasks();
    setTasks(loadedTasks);
    setLoading(false);
  };

  const getFilteredTasks = () => {
    if (!filterDate) return tasks;
    
    const filtered = tasks.filter(task => {
      if (!task.date) return false;
      if (filterMode === 'day') {
        return task.date === filterDate;
      } else {
        return task.date === filterDate;
      }
    });

    return filtered.sort((a, b) => {
      const timeA = a.time?.startTime;
      const timeB = b.time?.startTime;

      if (timeA && timeB) {
        return timeA.localeCompare(timeB);
      }
      if (timeA) return -1;
      if (timeB) return 1;
      return 0;
    });
  };

  const changeDate = (days: number) => {
    const date = new Date(filterDate);
    date.setDate(date.getDate() + days);
    setFilterDate(date.toISOString().split('T')[0]);
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedTask = { ...taskToUpdate, ...updates };
    
    // Optimistic update
    setTasks(tasks.map(t => t.id === taskId ? updatedTask : t));

    try {
      await updateTask(updatedTask);
    } catch (error) {
      console.error('Failed to update task', error);
      // Revert on error
      setTasks(tasks.map(t => t.id === taskId ? taskToUpdate : t));
    }
  };

  const handleRoleUpdate = async (taskId: string, roleUpdates: any) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedTask = {
      ...taskToUpdate,
      roles: {
        ...taskToUpdate.roles,
        ...roleUpdates
      }
    };
    
    handleTaskUpdate(taskId, { roles: updatedTask.roles });
  };

  const handleDevPlanUpdate = async (taskId: string, devPlanUpdates: any) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedTask = {
      ...taskToUpdate,
      roles: {
        ...taskToUpdate.roles,
        devPlan: {
          ...taskToUpdate.roles.devPlan,
          ...devPlanUpdates
        }
      }
    };

    handleTaskUpdate(taskId, { roles: updatedTask.roles });
  };

  const handleTimeUpdate = async (taskId: string, timeUpdates: any) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedTask = {
      ...taskToUpdate,
      time: {
        ...taskToUpdate.time,
        ...timeUpdates
      }
    };

    handleTaskUpdate(taskId, { time: updatedTask.time });
  };

  const handleTimetableSlotClick = (startTime: string) => {
    if (!selectedTaskId) return;
    handleTimeUpdate(selectedTaskId, { startTime });
  };

  const handleConfirmPlan = async (task: Task) => {
    const isNoDev = task.roles.devPlan.mode === 'NoDev';
    const message = isNoDev 
        ? 'このタスクを確定しますか？（Devなしのため、ステータスが「確定済」になります）'
        : 'このタスクの計画を確定しますか？（ステータスが「計画済」になります）';

    if (confirm(message)) {
        const updates: Partial<Task> = {
            roles: {
                ...task.roles,
                devPlan: {
                    ...task.roles.devPlan,
                    phase: 'Phase1Planned'
                }
            }
        };

        if (isNoDev) {
            updates.status = 'Scheduled';
        } else {
            updates.status = 'Planned';
        }

        await handleTaskUpdate(task.id, updates);
    }
  };

  const checkAvailability = (devId: string, date: string, startTime?: string, duration?: number) => {
    if (!startTime || !duration) return 'unknown';
    
    const schedules = settings.personalSchedules[devId] || [];
    const daySchedules = schedules.filter(s => s.date === date);
    
    // Simple check: if any schedule exists for the day, warn
    // Ideally we check time overlap
    if (daySchedules.some(s => s.type === 'fullDayOff')) return 'unavailable';
    
    // Check partial overlap
    const [startH, startM] = startTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = startMins + duration;

    for (const s of daySchedules) {
        if (s.type === 'partial' && s.start && s.end) {
            const [sStartH, sStartM] = s.start.split(':').map(Number);
            const [sEndH, sEndM] = s.end.split(':').map(Number);
            const sStartMins = sStartH * 60 + sStartM;
            const sEndMins = sEndH * 60 + sEndM;

            if (startMins < sEndMins && endMins > sStartMins) {
                return 'conflict';
            }
        }
    }

    return 'available';
  };

  const handleTimetableHeaderClick = (devId: string) => {
    if (!selectedTaskId) return;
    
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    const dev = settings.devs.find(d => d.id === devId);
    if (!dev) return;

    // Check role
    const role = settings.roles.find(r => r.id === dev.roleId);
    if (!role) return;

    const isPm = role.id === 'role-pm';
    const isDesigner = role.name.toLowerCase() === 'designer' || role.name === 'デザイナー';

    if (isPm) {
        // Toggle PM
        const newPmId = task.roles.pmId === devId ? undefined : devId;
        handleRoleUpdate(task.id, { pmId: newPmId });
    } else if (isDesigner) {
        // Toggle Designer
        const currentDesigners = task.roles.designerIds || [];
        let newDesigners;
        if (currentDesigners.includes(devId)) {
            newDesigners = currentDesigners.filter(id => id !== devId);
        } else {
            newDesigners = [...currentDesigners, devId];
        }
        handleRoleUpdate(task.id, { designerIds: newDesigners });
    }
  };

  const handleTrackHeaderClick = (trackId: string) => {
    if (!selectedTaskId) return;
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    if (task.roles.devPlan.mode !== 'Tracks') return;

    const currentTracks = task.roles.devPlan.assignedTrackIds || [];
    const requiredCount = task.roles.devPlan.requiredTrackCount || 0;
    
    let newTracks;
    if (currentTracks.includes(trackId)) {
      // Remove
      newTracks = currentTracks.filter(id => id !== trackId);
    } else {
      // Add (if limit not reached)
      if (currentTracks.length < requiredCount) {
        newTracks = [...currentTracks, trackId];
      } else {
        // Limit reached, do nothing
        return;
      }
    }
    
    handleDevPlanUpdate(task.id, { assignedTrackIds: newTracks });
  };

  const filteredTasks = getFilteredTasks();
  const pmDev = settings.devs.find(d => d.roleId === 'role-pm');
  const timeOptions = generateTimeOptions();
  const durationOptions = generateDurationOptions();

  // Prepare Timetable Props
  const isAssignmentConfirmed = settings.dailyAssignmentStatus?.[filterDate] === 'confirmed';
  let columnGroups: TimetableColumnGroup[] | undefined;

  if (isAssignmentConfirmed) {
    const assignment = settings.dailyTrackAssignments[filterDate] || {};
    const activeTracks = settings.tracks.filter(t => t.active);
    
    // PM Group
    const pmDevs = settings.devs.filter(d => d.roleId === 'role-pm');
    const designerRole = settings.roles.find(r => r.name.toLowerCase() === 'designer' || r.name === 'デザイナー');
    const designerDevs = designerRole ? settings.devs.filter(d => d.roleId === designerRole.id) : [];
    
    columnGroups = [];
    
    if (pmDevs.length > 0) {
      columnGroups.push({
        id: 'pm',
        title: '',
        devIds: pmDevs.map(d => d.id)
      });
    }
    
    if (designerDevs.length > 0) {
      columnGroups.push({
        id: 'designer',
        title: '',
        devIds: designerDevs.map(d => d.id)
      });
    }

    // Track Groups
    const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

    activeTracks.forEach(track => {
      const devIds = assignment[track.id] || [];
      if (devIds.length > 0) {
        let backgroundColor = undefined;
        
        if (selectedTask && selectedTask.roles.devPlan.mode === 'Tracks') {
            const assignedIds = selectedTask.roles.devPlan.assignedTrackIds || [];
            const required = selectedTask.roles.devPlan.requiredTrackCount || 0;
            const isAssigned = assignedIds.includes(track.id);
            
            if (isAssigned) {
                backgroundColor = '#ffb74d'; // Orange
            } else {
                if (assignedIds.length < required) {
                    backgroundColor = '#fff59d'; // Light Yellow
                } else {
                    backgroundColor = '#ffffff'; // White
                }
            }
        }

        columnGroups!.push({
          id: track.id,
          title: track.name,
          devIds: devIds,
          onHeaderClick: () => handleTrackHeaderClick(track.id),
          backgroundColor
        });
      }
    });
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="standup-tab">
      <div className="standup-header">
        <h2>Phase 1: 全体計画</h2>
        <div className="filters">
          <button className="btn-icon" onClick={() => changeDate(-1)}>◀</button>
          <input 
            type="date" 
            value={filterDate} 
            onChange={(e) => setFilterDate(e.target.value)} 
          />
          <button className="btn-icon" onClick={() => changeDate(1)}>▶</button>
        </div>
      </div>

      <div className="standup-content">
        <div className="tasks-table-container">
          <table className="standup-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>PM</th>
                <th>Dev</th>
                <th>時間</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="no-data">タスクがありません</td>
                </tr>
              ) : (
                filteredTasks.map(task => {
                  const pmAvailability = (task.roles.pmId && task.date) 
                      ? checkAvailability(task.roles.pmId, task.date, task.time?.startTime, task.time?.duration)
                      : 'unknown';
                  
                  return (
                  <tr 
                    key={task.id} 
                    className={`task-row status-${task.status.toLowerCase()} ${selectedTaskId === task.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTaskId(prev => prev === task.id ? null : task.id)}
                  >
                    <td>
                      <div className="task-title">{task.title}</div>
                      <div className="task-summary">{task.summary}</div>
                    </td>
                    <td>
                      {pmDev ? (
                          <div className="pm-check">
                              <label>
                                  <input 
                                      type="checkbox"
                                      checked={task.roles.pmId === pmDev.id}
                                      onChange={(e) => handleRoleUpdate(task.id, { pmId: e.target.checked ? pmDev.id : undefined })}
                                  />
                              </label>
                              {task.roles.pmId && pmAvailability !== 'available' && pmAvailability !== 'unknown' && (
                                  <span className="availability-warning" title="PMの予定と重複しています">⚠️</span>
                              )}
                          </div>
                      ) : (
                          <span className="no-pm-alert">PM未設定</span>
                      )}
                    </td>
                    <td>
                      <select
                        value={task.roles.devPlan.mode}
                        onChange={(e) => handleDevPlanUpdate(task.id, { mode: e.target.value as DevMode })}
                        className="compact-select"
                      >
                        <option value="NoDev">なし</option>
                        <option value="Tracks">トラック数</option>
                        <option value="AllDev">全員</option>
                      </select>
                      {task.roles.devPlan.mode === 'Tracks' && (
                        <div className="track-count-input">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={task.roles.devPlan.requiredTrackCount}
                            onChange={(e) => handleDevPlanUpdate(task.id, { requiredTrackCount: parseInt(e.target.value) || 0 })}
                            className="compact-number"
                          />
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="time-edit">
                          <select
                              value={task.time?.startTime || ''}
                              onChange={(e) => handleTimeUpdate(task.id, { startTime: e.target.value })}
                              className="compact-select time-select"
                          >
                              <option value="">開始...</option>
                              {timeOptions.map(t => (
                                  <option key={t} value={t}>{t}</option>
                              ))}
                          </select>
                          <select
                              value={task.time?.duration || ''}
                              onChange={(e) => handleTimeUpdate(task.id, { duration: parseInt(e.target.value) })}
                              className="compact-select duration-select"
                          >
                              <option value="">時間...</option>
                              {durationOptions.map(d => (
                                  <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                          </select>
                      </div>
                    </td>
                    <td>
                      {task.roles.devPlan.phase !== 'Phase1Planned' && task.status !== 'Scheduled' && (
                          <button 
                              className={`btn btn-sm ${task.roles.devPlan.mode === 'NoDev' ? 'btn-success' : 'btn-primary'}`}
                              onClick={() => handleConfirmPlan(task)}
                              disabled={!task.time?.startTime || !task.time?.duration}
                          >
                              {task.roles.devPlan.mode === 'NoDev' ? '確定' : '計画済'}
                          </button>
                      )}
                      {(task.roles.devPlan.phase === 'Phase1Planned' || task.status === 'Scheduled') && (
                          <span className="badge badge-success">
                              {task.status === 'Scheduled' ? '確定済' : '計画済'}
                          </span>
                      )}
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
        <div className="timetable-wrapper">
          <Timetable 
            date={filterDate}
            tasks={filteredTasks}
            settings={settings}
            selectedTaskId={selectedTaskId}
            onSlotClick={handleTimetableSlotClick}
            onEventClick={(taskId) => setSelectedTaskId(taskId)}
            onHeaderClick={handleTimetableHeaderClick}
            columnGroups={columnGroups}
          />
        </div>
      </div>
    </div>
  );
};

export default StandupTab;
