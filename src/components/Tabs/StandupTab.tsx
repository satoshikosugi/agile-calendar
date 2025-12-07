import React, { useState, useEffect, useRef } from 'react';
import { Task, Settings, DevMode, PersonalSchedule, PersonalScheduleType, TaskStatus } from '../../models/types';
import { loadTasks, updateTask, createTask, deleteTask, renderPersonalSchedulesForMonth } from '../../services/tasksService';
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
    requiredTrackCount: 0,
    externalTeamId: '',
    startTime: '',
    duration: 30
  });
  
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showTaskForm && taskInputRef.current) {
      taskInputRef.current.focus();
    }
  }, [showTaskForm]);

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

  const loadTasksData = async (silent = false) => {
    if (!silent) setLoading(true);
    const loadedTasks = await loadTasks();
    setTasks(loadedTasks);
    if (!silent) setLoading(false);
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
          await updateTask(task, settings);
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
            requiredTrackCount: 0,
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
          requiredTrackCount: newTaskData.requiredTrackCount,
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
    await loadTasksData(true);
    setShowTaskForm(false);
    setSelectedTaskId(newTask.id);
  };

  const handleAddSchedule = async () => {
    if (!newScheduleDevId) return;
    
    const devSchedules = settings.personalSchedules[newScheduleDevId] || [];
    const updatedSchedules = [...devSchedules, { ...newSchedule, date: filterDate }];
    
    const newSettings = {
      ...settings,
      personalSchedules: {
        ...settings.personalSchedules,
        [newScheduleDevId]: updatedSchedules
      }
    };

    onSettingsUpdate(newSettings);
    
    setShowScheduleForm(false);
    setNewSchedule({ ...newSchedule, reason: '' });

    // Trigger calendar update for personal schedules
    try {
        const yearMonth = filterDate.substring(0, 7);
        await renderPersonalSchedulesForMonth(yearMonth);
    } catch (e) {
        console.error('Failed to update calendar personal schedules', e);
    }
  };

  const filteredTasks = getFilteredTasks();
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

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [rescheduleDate, setRescheduleDate] = useState('');

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
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleRescheduleSelected = async () => {
    if (selectedTaskIds.size === 0) return;
    if (!rescheduleDate) {
        alert('移動先の日付を選択してください');
        return;
    }

    if (!confirm(`${selectedTaskIds.size}件のタスクを ${rescheduleDate} に移動しますか？`)) return;

    setLoading(true);
    try {
        const tasksToUpdate = tasks.filter(t => selectedTaskIds.has(t.id));
        for (const task of tasksToUpdate) {
            await updateTask({ ...task, date: rescheduleDate });
        }
        await loadTasksData();
        setSelectedTaskIds(new Set());
        setRescheduleDate('');
        alert('移動が完了しました。');
    } catch (error) {
        console.error(error);
        alert('移動中にエラーが発生しました。');
    } finally {
        setLoading(false);
    }
  };

  const handleStatusToggle = async (task: Task) => {
      let newStatus: TaskStatus = task.status;
      if (task.status === 'Draft') {
          newStatus = 'Planned';
      } else if (task.status === 'Planned') {
          newStatus = 'Draft';
      } else {
          return;
      }
      
      await handleTaskUpdate(task.id, { status: newStatus });
  };


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

      {/* Bulk Actions */}
      {selectedTaskIds.size > 0 && (
        <div className="bulk-actions" style={{ padding: '10px', background: '#f0f0f0', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>{selectedTaskIds.size}件選択中</span>
          <input 
            type="date" 
            value={rescheduleDate} 
            onChange={(e) => setRescheduleDate(e.target.value)}
          />
          <button onClick={handleRescheduleSelected}>まとめて移動</button>
        </div>
      )}

      {showTaskForm && (
        <div className="schedule-quick-form">
          <div className="form-row">
            <input 
              ref={taskInputRef}
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
              value={`${newTaskData.devMode}:${newTaskData.devMode === 'Tracks' ? newTaskData.requiredTrackCount : 0}`}
              onChange={(e) => {
                  const [mode, countStr] = e.target.value.split(':');
                  setNewTaskData({
                      ...newTaskData, 
                      devMode: mode as DevMode,
                      requiredTrackCount: parseInt(countStr)
                  });
              }}
              className="compact-select"
            >
              <option value="NoDev:0">Devなし</option>
              {settings.tracks.slice(0, -1).map((_, i) => {
                  const count = i + 1;
                  return (
                      <option key={count} value={`Tracks:${count}`}>{count} Track{count > 1 ? 's' : ''}</option>
                  );
              })}
              <option value="AllDev:0">全員</option>
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
                  onChange={(e) => {
                    const newStart = e.target.value;
                    let newEnd = newSchedule.end;
                    if (newSchedule.start && newSchedule.end) {
                        const [h1, m1] = newSchedule.start.split(':').map(Number);
                        const [h2, m2] = newSchedule.end.split(':').map(Number);
                        const startMins = h1 * 60 + m1;
                        const endMins = h2 * 60 + m2;
                        const duration = endMins - startMins;
                        if (duration > 0) {
                            const [h3, m3] = newStart.split(':').map(Number);
                            const newStartMins = h3 * 60 + m3;
                            const newEndMins = newStartMins + duration;
                            const endH = Math.floor(newEndMins / 60);
                            const endM = newEndMins % 60;
                            const formattedEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                            newEnd = formattedEnd;
                        }
                    }
                    setNewSchedule({...newSchedule, start: newStart, end: newEnd});
                  }}
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
                <th style={{width: '30px'}}>
                    <input 
                        type="checkbox" 
                        checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
                        onChange={toggleSelectAll}
                    />
                </th>
                <th>タイトル</th>
                <th>PM</th>
                <th>Dev</th>
                <th>外部チーム</th>
                <th>時間</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const isSelected = selectedTaskId === task.id;
                const conflict = checkTaskConflict(task);
                const isChecked = selectedTaskIds.has(task.id);
                
                return (
                  <tr 
                    key={task.id} 
                    className={`${isSelected ? 'selected' : ''} ${conflict ? 'conflict' : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleSelect(task.id)}
                        />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        value={task.title} 
                        onChange={(e) => handleTaskUpdate(task.id, { title: e.target.value })}
                      />
                    </td>
                    <td>
                      <select 
                        value={task.roles.pmId || ''} 
                        onChange={(e) => handleRoleUpdate(task.id, { pmId: e.target.value || undefined })}
                      >
                        <option value="">-</option>
                        {settings.devs.filter(d => d.roleId === 'role-pm').map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="dev-cell">
                        <select 
                          value={task.roles.devPlan.mode} 
                          onChange={(e) => handleDevPlanUpdate(task.id, { mode: e.target.value })}
                        >
                          <option value="NoDev">なし</option>
                          <option value="Tracks">トラック</option>
                          <option value="Any">誰でも</option>
                        </select>
                        {task.roles.devPlan.mode === 'Tracks' && (
                          <input 
                            type="number" 
                            className="track-count"
                            min="1" 
                            max="4"
                            value={task.roles.devPlan.requiredTrackCount}
                            onChange={(e) => handleDevPlanUpdate(task.id, { requiredTrackCount: parseInt(e.target.value) })}
                          />
                        )}
                      </div>
                    </td>
                    <td>
                      <select 
                        value={task.externalParticipants?.[0]?.teamId || ''} 
                        onChange={(e) => {
                          const teamId = e.target.value;
                          const newParticipants = teamId ? [{ teamId, required: true, timeFixed: false }] : [];
                          handleTaskUpdate(task.id, { externalParticipants: newParticipants });
                        }}
                      >
                        <option value="">-</option>
                        {settings.externalTeams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="time-cell">
                        <select 
                          value={task.time?.startTime || ''} 
                          onChange={(e) => handleTimeUpdate(task.id, { startTime: e.target.value })}
                        >
                          <option value="">未定</option>
                          {timeOptions.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <select 
                          value={task.time?.duration || 30} 
                          onChange={(e) => handleTimeUpdate(task.id, { duration: parseInt(e.target.value) })}
                        >
                          {durationOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                            className={`status-btn ${task.status.toLowerCase()}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStatusToggle(task);
                            }}
                        >
                            {task.status === 'Draft' ? '下書き' : 
                             task.status === 'Planned' ? '計画済' : '完了'}
                        </button>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if(onEditTask) onEditTask(task);
                        }}>詳細</button>
                        <button 
                          className="delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if(confirm('削除しますか？')) handleDeleteTask(task.id);
                          }}
                        >×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="timetable-container">
          <Timetable 
            settings={settings}
            tasks={filteredTasks}
            date={filterDate}
            onSlotClick={handleTimetableSlotClick}
            onHeaderClick={handleTimetableHeaderClick}
            columnGroups={columnGroups}
          />
        </div>
      </div>
    </div>
  );
};

export default StandupTab;
