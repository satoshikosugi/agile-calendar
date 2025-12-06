import React, { useState, useEffect, useRef } from 'react';
import { Task, Settings, DevMode, PersonalSchedule, PersonalScheduleType } from '../../models/types';
import { loadTasks, updateTask, createTask, deleteTask } from '../../services/tasksService';
import { WORKING_START_MIN, WORKING_END_MIN, parseTime, formatTime, getDevEvents } from '../../services/scheduleService';
import Timetable, { TimetableColumnGroup } from '../Timetable';
import './StandupTab.css';

interface StandupTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
  onEditTask?: (task: Task) => void;
  currentDate?: string;
  onDateChange?: (date: string) => void;
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

const StandupTab: React.FC<StandupTabProps> = ({ settings, onSettingsUpdate, onEditTask, currentDate, onDateChange }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [localDate, setLocalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const filterDate = currentDate || localDate;
  
  const handleDateChange = (newDate: string) => {
      if (onDateChange) {
          onDateChange(newDate);
      } else {
          setLocalDate(newDate);
      }
  };

  const [filterMode] = useState<'day' | 'week'>('day');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Map<string, Task>>(new Map());

  // Schedule Form State
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newScheduleDevId, setNewScheduleDevId] = useState('');
  const [newSchedule, setNewSchedule] = useState<PersonalSchedule>({
    date: '',
    type: 'partial',
    reason: '',
    start: '09:00',
    end: '10:00'
  });

  // Task Quick Add Form State
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskData, setNewTaskData] = useState({
    title: '',
    pmId: '',
    devMode: 'NoDev' as DevMode,
    externalTeamId: '',
    startTime: '',
    duration: 30
  });

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

      if (e.key === 'Delete') {
        const task = tasks.find(t => t.id === selectedTaskId);
        if (task && confirm(`タスク「${task.title}」を削除してもよろしいですか？`)) {
            handleDeleteTask(selectedTaskId);
        }
        return;
      }

      const task = tasks.find(t => t.id === selectedTaskId);
      if (!task || !task.time?.startTime) return;

      // Check if time is fixed by external team or locked
      if (task.externalParticipants?.some(p => p.timeFixed) || task.constraints?.timeLocked) return;

      const currentMins = parseTime(task.time.startTime);
      const duration = task.time.duration || 30;
      const direction = e.key === 'ArrowUp' ? -5 : e.key === 'ArrowDown' ? 5 : 0;

      if (direction === 0) return;
      e.preventDefault();

      const newMins = currentMins + direction;

      // Check boundaries
      if (newMins >= WORKING_START_MIN && newMins <= WORKING_END_MIN - duration) {
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
    handleDateChange(date.toISOString().split('T')[0]);
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    const updatedTask = { ...taskToUpdate, ...updates };
    
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));

    // Debounce API call
    pendingUpdatesRef.current.set(taskId, updatedTask);

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(async () => {
      const tasksToSave = Array.from(pendingUpdatesRef.current.values());
      pendingUpdatesRef.current.clear();
      
      for (const task of tasksToSave) {
        try {
          await updateTask(task);
        } catch (error) {
          console.error('Failed to update task', error);
          // Reload on error to ensure consistency
          loadTasksData();
        }
      }
    }, 500);
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

  const handleDeleteTask = async (taskId: string) => {
    // Optimistic update
    setTasks(tasks.filter(t => t.id !== taskId));
    setSelectedTaskId(null);

    try {
        await deleteTask(taskId);
    } catch (error) {
        console.error('Failed to delete task', error);
        // Reload tasks on error
        loadTasksData();
    }
  };

  const handleTimetableSlotClick = (startTime: string) => {
    if (!selectedTaskId) return;
    
    const task = tasks.find(t => t.id === selectedTaskId);
    if (task?.externalParticipants?.some(p => p.timeFixed) || task?.constraints?.timeLocked) return;

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

  const checkTaskConflict = (task: Task) => {
    if (!task.date || !task.time?.startTime || !task.time?.duration) return false;

    const startMins = parseTime(task.time.startTime);
    const endMins = startMins + task.time.duration;

    for (const dev of settings.devs) {
        const devEvents = getDevEvents(task.date, dev.id, tasks, settings);
        
        // Check if this task is assigned to this dev
        const isAssigned = devEvents.some(e => e.id === task.id);
        if (!isAssigned) continue;
        
        // Check for overlap with other events
        for (const event of devEvents) {
            if (event.id === task.id) continue;
            
            if (startMins < event.end && endMins > event.start) {
                return true;
            }
        }
    }
    return false;
  };

  const checkAvailability = (devId: string, date: string, startTime?: string, duration?: number) => {
    // Check Project Holidays
    const isProjectHoliday = settings.projectHolidays?.some(h => h.date === date);
    if (isProjectHoliday) return 'unavailable';

    if (!startTime || !duration) return 'unknown';
    
    const schedules = settings.personalSchedules[devId] || [];
    const daySchedules = schedules.filter(s => s.date === date);
    
    // Check full day off
    if (daySchedules.some(s => s.type === 'fullDayOff')) return 'unavailable';
    
    // Check partial overlap (including nonAgileTask and personalErrand)
    const [startH, startM] = startTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = startMins + duration;

    for (const s of daySchedules) {
        if ((s.type === 'partial' || s.type === 'nonAgileTask' || s.type === 'personalErrand') && s.start && s.end) {
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

  const handleAddTask = () => {
    setShowTaskForm(!showTaskForm);
    setShowScheduleForm(false); // Close other form
    if (!showTaskForm) {
        setNewTaskData({
            title: '',
            pmId: '',
            devMode: 'NoDev',
            externalTeamId: '',
            startTime: '',
            duration: 30
        });
    }
  };

  const handleConfirmAddTask = async () => {
    if (!newTaskData.title) {
        alert('タイトルを入力してください');
        return;
    }

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title: newTaskData.title,
      summary: '',
      status: 'Draft',
      date: filterDate,
      roles: {
        pmId: newTaskData.pmId || undefined,
        designerIds: [],
        devPlan: {
          phase: 'Draft',
          mode: newTaskData.devMode,
          requiredTrackCount: newTaskData.devMode === 'Tracks' ? 1 : 0,
          assignedTrackIds: []
        }
      },
      externalParticipants: newTaskData.externalTeamId ? [{
          teamId: newTaskData.externalTeamId,
          required: true,
          timeFixed: false
      }] : [],
      constraints: {
        timeLocked: false,
        rolesLocked: false,
        externalFixed: false
      },
      time: {
          startTime: newTaskData.startTime || undefined,
          duration: newTaskData.duration
      }
    };

    setTasks([...tasks, newTask]);
    await createTask(newTask);
    loadTasksData();
    setShowTaskForm(false);
  };

  const handleAddSchedule = () => {
    if (!newScheduleDevId) return;
    
    const devSchedules = settings.personalSchedules[newScheduleDevId] || [];
    const updatedSchedules = [...devSchedules, { ...newSchedule, date: filterDate }];
    
    onSettingsUpdate({
      ...settings,
      personalSchedules: {
        ...settings.personalSchedules,
        [newScheduleDevId]: updatedSchedules
      }
    });
    
    setShowScheduleForm(false);
    setNewSchedule({ ...newSchedule, reason: '' });
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
        <h2>スタンドアップ</h2>
        <div className="filters">
          <button className="btn-icon" onClick={() => changeDate(-1)}>◀</button>
          <input 
            type="date" 
            value={filterDate} 
            onChange={(e) => handleDateChange(e.target.value)} 
          />
          <button className="btn-icon" onClick={() => changeDate(1)}>▶</button>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleAddTask}>タスク追加</button>
          <button className="btn btn-secondary" onClick={() => {
            setNewSchedule({ ...newSchedule, date: filterDate });
            setShowScheduleForm(!showScheduleForm);
            setShowTaskForm(false);
          }}>
            個人予定追加
          </button>
        </div>
      </div>

      {showTaskForm && (
        <div className="schedule-quick-form">
          <div className="form-row">
            <input 
              type="text" 
              placeholder="タスク名" 
              value={newTaskData.title}
              onChange={(e) => setNewTaskData({...newTaskData, title: e.target.value})}
              className="compact-input"
              style={{ width: '200px' }}
            />
            <select 
              value={newTaskData.pmId} 
              onChange={(e) => setNewTaskData({...newTaskData, pmId: e.target.value})}
              className="compact-select"
            >
              <option value="">PM選択...</option>
              {settings.devs.filter(d => d.roleId === 'role-pm').map(dev => (
                <option key={dev.id} value={dev.id}>{dev.name}</option>
              ))}
            </select>
            <select 
              value={newTaskData.devMode} 
              onChange={(e) => setNewTaskData({...newTaskData, devMode: e.target.value as DevMode})}
              className="compact-select"
            >
              <option value="NoDev">Devなし</option>
              <option value="Tracks">トラック数</option>
              <option value="AllDev">全員</option>
            </select>
            <select 
              value={newTaskData.externalTeamId} 
              onChange={(e) => setNewTaskData({...newTaskData, externalTeamId: e.target.value})}
              className="compact-select"
            >
              <option value="">外部チーム...</option>
              {settings.externalTeams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <select 
              value={newTaskData.startTime} 
              onChange={(e) => setNewTaskData({...newTaskData, startTime: e.target.value})}
              className="compact-select"
            >
              <option value="">開始時間...</option>
              {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select 
              value={newTaskData.duration} 
              onChange={(e) => setNewTaskData({...newTaskData, duration: parseInt(e.target.value)})}
              className="compact-select"
            >
              {durationOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button className="btn btn-sm btn-primary" onClick={handleConfirmAddTask}>追加</button>
          </div>
        </div>
      )}

      {showScheduleForm && (
        <div className="schedule-quick-form">
          <div className="form-row">
            <select 
              value={newScheduleDevId} 
              onChange={(e) => setNewScheduleDevId(e.target.value)}
              className="compact-select"
            >
              <option value="">メンバー選択...</option>
              {settings.devs.map(dev => (
                <option key={dev.id} value={dev.id}>{dev.name}</option>
              ))}
            </select>
            <select 
              value={newSchedule.type} 
              onChange={(e) => setNewSchedule({...newSchedule, type: e.target.value as PersonalScheduleType})}
              className="compact-select"
            >
              <option value="fullDayOff">終日休暇</option>
              <option value="partial">時間休/中抜け</option>
              <option value="nonAgileTask">アジャイル外</option>
              <option value="personalErrand">所用</option>
            </select>
            {newSchedule.type !== 'fullDayOff' && (
              <>
                <select 
                  value={newSchedule.start} 
                  onChange={(e) => setNewSchedule({...newSchedule, start: e.target.value})}
                  className="compact-select"
                >
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span>~</span>
                <select 
                  value={newSchedule.end} 
                  onChange={(e) => setNewSchedule({...newSchedule, end: e.target.value})}
                  className="compact-select"
                >
                  {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
            <input 
              type="text" 
              placeholder="理由" 
              value={newSchedule.reason}
              onChange={(e) => setNewSchedule({...newSchedule, reason: e.target.value})}
              className="compact-input"
            />
            <button className="btn btn-sm btn-primary" onClick={handleAddSchedule} disabled={!newScheduleDevId}>追加</button>
          </div>
        </div>
      )}

      <div className="standup-content">
        <div className="tasks-table-container">
          <table className="standup-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>PM</th>
                <th>Dev</th>
                <th>外部チーム</th>
                <th>時間</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="no-data">タスクがありません</td>
                </tr>
              ) : (
                filteredTasks.map(task => {
                  const pmAvailability = (task.roles.pmId && task.date) 
                      ? checkAvailability(task.roles.pmId, task.date, task.time?.startTime, task.time?.duration)
                      : 'unknown';
                  
                  const isTimeFixed = task.externalParticipants?.some(p => p.timeFixed) || task.constraints?.timeLocked;
                  const isConflict = checkTaskConflict(task);

                  return (
                  <tr 
                    key={task.id} 
                    className={`task-row status-${task.status.toLowerCase()} ${selectedTaskId === task.id ? 'selected' : ''} ${isConflict ? 'has-conflict' : ''}`}
                    onClick={() => setSelectedTaskId(prev => prev === task.id ? null : task.id)}
                    onDoubleClick={() => onEditTask && onEditTask(task)}
                  >
                    <td>
                      {selectedTaskId === task.id && (
                        <button 
                          className="floating-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTask && onEditTask(task);
                          }}
                        >
                          編集
                        </button>
                      )}
                      <div className="task-title" style={{ display: 'flex', alignItems: 'center' }}>
                        {isTimeFixed && <span title="時間固定" style={{ marginRight: '4px', fontSize: '0.9em' }}>🔒</span>}
                        <span>{task.title}</span>
                      </div>
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
                        value={`${task.roles.devPlan.mode}:${task.roles.devPlan.mode === 'Tracks' ? task.roles.devPlan.requiredTrackCount : 0}`}
                        onChange={(e) => {
                          const [mode, countStr] = e.target.value.split(':');
                          handleDevPlanUpdate(task.id, { 
                            mode: mode as DevMode, 
                            requiredTrackCount: parseInt(countStr) 
                          });
                        }}
                        className="compact-select"
                      >
                        <option value="NoDev:0">なし</option>
                        {settings.tracks.slice(0, -1).map((_, i) => {
                          const count = i + 1;
                          return (
                            <option key={count} value={`Tracks:${count}`}>
                              {count} Track{count > 1 ? 's' : ''}
                            </option>
                          );
                        })}
                        <option value="AllDev:0">全員</option>
                      </select>
                    </td>
                    <td>
                      <div className="external-teams-cell">
                        {task.externalParticipants && task.externalParticipants.length > 0 ? (
                          task.externalParticipants.map(p => {
                            const team = settings.externalTeams.find(t => t.id === p.teamId);
                            if (!team) return null;
                            return (
                              <div key={p.teamId} className="external-team-badge">
                                {team.name}
                                {p.required && <span className="badge-icon" title="必須">★</span>}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="time-edit">
                          <select
                              value={task.time?.startTime || ''}
                              onChange={(e) => handleTimeUpdate(task.id, { startTime: e.target.value })}
                              className="compact-select time-select"
                              disabled={isTimeFixed}
                              title={isTimeFixed ? "時間が固定されています" : ""}
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
                              disabled={isTimeFixed}
                              title={isTimeFixed ? "時間が固定されています" : ""}
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
