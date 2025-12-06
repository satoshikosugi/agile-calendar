import React, { useState } from 'react';
import { Settings, Dev, Track, Role, DailyTrackAssignment, PersonalSchedule, PersonalScheduleType } from '../../models/types';
import { generateAutoAssignment, copyPreviousDayAssignment } from '../../services/trackAssignmentService';
import './TracksTab.css';
import './TracksTab_Schedule.css';

interface TracksTabProps {
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

const TracksTab: React.FC<TracksTabProps> = ({ settings, onSettingsUpdate }) => {
  // UI State
  const [activeTab, setActiveTab] = useState<'assignment' | 'schedule' | 'master'>('assignment');
  const [activeMasterTab, setActiveMasterTab] = useState<'members' | 'roles' | 'tracks'>('members');

  // Assignment State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null);

  // Personal Schedule State
  const [scheduleDevId, setScheduleDevId] = useState<string>('');
  const [newSchedule, setNewSchedule] = useState<PersonalSchedule>({
    date: new Date().toISOString().split('T')[0],
    type: 'fullDayOff',
    reason: '',
    start: '09:00',
    end: '18:00'
  });
  // Duration state for UI (calculated from start/end or user input)
  const [scheduleDuration, setScheduleDuration] = useState<number>(60); // Default 1 hour

  // Master Data State
  const [editingDev, setEditingDev] = useState<Dev | null>(null);
  const [newDevName, setNewDevName] = useState('');
  const [newDevRoleId, setNewDevRoleId] = useState<string>('');

  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [newTrackName, setNewTrackName] = useState('');

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#cccccc');

  // Assignment Helpers
  const getCurrentAssignment = (): DailyTrackAssignment => {
    return settings.dailyTrackAssignments[selectedDate] || {};
  };

  const getAssignmentStatus = (): 'confirmed' | 'unconfirmed' => {
    return settings.dailyAssignmentStatus?.[selectedDate] || 'unconfirmed';
  };

  const toggleAssignmentStatus = () => {
    const currentStatus = getAssignmentStatus();
    const newStatus = currentStatus === 'confirmed' ? 'unconfirmed' : 'confirmed';
    onSettingsUpdate({
      ...settings,
      dailyAssignmentStatus: {
        ...settings.dailyAssignmentStatus,
        [selectedDate]: newStatus
      }
    });
  };

  const getAssignedDevIds = (): Set<string> => {
    const assignment = getCurrentAssignment();
    const ids = new Set<string>();
    Object.values(assignment).forEach(devIds => devIds.forEach(id => ids.add(id)));
    return ids;
  };

  const updateAssignment = (newAssignment: DailyTrackAssignment) => {
    onSettingsUpdate({
      ...settings,
      dailyTrackAssignments: {
        ...settings.dailyTrackAssignments,
        [selectedDate]: newAssignment
      }
    });
  };

  // Assignment Handlers
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
    setSelectedDevId(null);
  };

  const handleDevClick = (devId: string) => {
    if (selectedDevId === devId) {
      setSelectedDevId(null);
    } else {
      setSelectedDevId(devId);
    }
  };

  const handleTrackAreaClick = (trackId: string | 'unassigned') => {
    if (!selectedDevId) return;

    const currentAssignment = getCurrentAssignment();
    const newAssignment: DailyTrackAssignment = JSON.parse(JSON.stringify(currentAssignment));

    // Remove from old location
    Object.keys(newAssignment).forEach(tid => {
      newAssignment[tid] = newAssignment[tid].filter(id => id !== selectedDevId);
    });

    // Add to new location
    if (trackId !== 'unassigned') {
      if (!newAssignment[trackId]) newAssignment[trackId] = [];
      newAssignment[trackId].push(selectedDevId);
    }

    // Clean up empty tracks
    Object.keys(newAssignment).forEach(tid => {
      if (newAssignment[tid].length === 0) delete newAssignment[tid];
    });

    updateAssignment(newAssignment);
    setSelectedDevId(null);
  };

  const handleAutoAssign = () => {
    const assignment = generateAutoAssignment(selectedDate, settings, getCurrentAssignment());
    updateAssignment(assignment);
  };

  const handleClearAssignment = () => {
    if (confirm('この日の割り当てを全てクリアしますか？')) {
      updateAssignment({});
    }
  };

  const handleCopyPrevious = () => {
    const prev = copyPreviousDayAssignment(selectedDate, settings);
    if (prev) {
      updateAssignment(prev);
    } else {
      alert('前日のデータが見つかりませんでした。');
    }
  };

  // Personal Schedule Handlers
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + durationMinutes;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    // Cap at 23:59 or handle overflow if needed, but for now simple calc
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  };

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStart = e.target.value;
    const newEnd = calculateEndTime(newStart, scheduleDuration);
    setNewSchedule({ ...newSchedule, start: newStart, end: newEnd });
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDuration = parseInt(e.target.value, 10);
    setScheduleDuration(newDuration);
    if (newSchedule.start) {
      const newEnd = calculateEndTime(newSchedule.start, newDuration);
      setNewSchedule({ ...newSchedule, end: newEnd });
    }
  };

  const handleAddSchedule = () => {
    if (!scheduleDevId) {
      alert('メンバーを選択してください');
      return;
    }
    if (!newSchedule.date) {
      alert('日付を選択してください');
      return;
    }

    const currentSchedules = settings.personalSchedules[scheduleDevId] || [];
    const updatedSchedules = [...currentSchedules, { ...newSchedule }];
    updatedSchedules.sort((a, b) => a.date.localeCompare(b.date));

    onSettingsUpdate({
      ...settings,
      personalSchedules: {
        ...settings.personalSchedules,
        [scheduleDevId]: updatedSchedules
      }
    });

    setNewSchedule({ ...newSchedule, reason: '' });
  };

  const handleRemoveSchedule = (devId: string, index: number) => {
    if (!confirm('このスケジュールを削除してもよろしいですか？')) return;
    const currentSchedules = settings.personalSchedules[devId] || [];
    const updatedSchedules = [...currentSchedules];
    updatedSchedules.splice(index, 1);
    onSettingsUpdate({
      ...settings,
      personalSchedules: {
        ...settings.personalSchedules,
        [devId]: updatedSchedules
      }
    });
  };

  // Role Handlers
  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    const newRole: Role = {
      id: `r${Date.now()}`,
      name: newRoleName,
      color: newRoleColor
    };
    onSettingsUpdate({
      ...settings,
      roles: [...(settings.roles || []), newRole]
    });
    setNewRoleName('');
    setNewRoleColor('#cccccc');
  };

  const handleUpdateRole = (roleId: string, updates: Partial<Role>) => {
    const updatedRoles = (settings.roles || []).map(r => 
      r.id === roleId ? { ...r, ...updates } : r
    );
    onSettingsUpdate({ ...settings, roles: updatedRoles });
    setEditingRole(null);
  };

  const handleRemoveRole = (roleId: string) => {
    if (confirm('このロールを削除しますか？')) {
      const updatedRoles = (settings.roles || []).filter(r => r.id !== roleId);
      onSettingsUpdate({ ...settings, roles: updatedRoles });
    }
  };

  // Dev Handlers
  const handleAddDev = () => {
    if (!newDevName.trim()) return;
    const newDev: Dev = {
      id: `d${Date.now()}`,
      name: newDevName,
      roleId: newDevRoleId || undefined
    };
    onSettingsUpdate({
      ...settings,
      devs: [...settings.devs, newDev]
    });
    setNewDevName('');
    setNewDevRoleId('');
  };

  const handleUpdateDev = (devId: string, updates: Partial<Dev>) => {
    const updatedDevs = settings.devs.map(d => 
      d.id === devId ? { ...d, ...updates } : d
    );
    onSettingsUpdate({ ...settings, devs: updatedDevs });
    setEditingDev(null);
  };

  const handleRemoveDev = (devId: string) => {
    if (confirm('このメンバーを削除してもよろしいですか？')) {
      const updatedSettings = {
        ...settings,
        devs: settings.devs.filter(dev => dev.id !== devId),
      };
      onSettingsUpdate(updatedSettings);
    }
  };

  // Track Handlers
  const handleAddTrack = () => {
    if (!newTrackName.trim()) return;
    const newTrack: Track = {
      id: `t${Date.now()}`,
      name: newTrackName,
      role: 'Dev',
      capacity: 2,
      active: true,
    };
    onSettingsUpdate({
      ...settings,
      tracks: [...settings.tracks, newTrack],
    });
    setNewTrackName('');
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    const updatedTracks = settings.tracks.map(track =>
      track.id === trackId ? { ...track, ...updates } : track
    );
    onSettingsUpdate({ ...settings, tracks: updatedTracks });
    setEditingTrack(null);
  };

  const handleToggleTrackActive = (trackId: string) => {
    const updatedTracks = settings.tracks.map(track =>
      track.id === trackId ? { ...track, active: !track.active } : track
    );
    onSettingsUpdate({ ...settings, tracks: updatedTracks });
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, devId: string) => {
    e.dataTransfer.setData('devId', devId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const devId = e.dataTransfer.getData('devId');
    if (!devId) return;

    const currentAssignment = getCurrentAssignment();
    const newAssignment: DailyTrackAssignment = JSON.parse(JSON.stringify(currentAssignment));

    Object.keys(newAssignment).forEach(tid => {
      newAssignment[tid] = newAssignment[tid].filter(id => id !== devId);
    });

    if (targetId !== 'unassigned') {
      if (!newAssignment[targetId]) newAssignment[targetId] = [];
      newAssignment[targetId].push(devId);
    }

    Object.keys(newAssignment).forEach(tid => {
      if (newAssignment[tid].length === 0) delete newAssignment[tid];
    });

    updateAssignment(newAssignment);
    setSelectedDevId(null);
  };

  // Render Helpers
  const currentAssignment = getCurrentAssignment();
  const assignedDevIds = getAssignedDevIds();
  const absentDevIds = new Set(currentAssignment['absent'] || []);
  
  // Only show Devs in the assignment view
  const assignableDevs = settings.devs.filter(dev => {
    const role = settings.roles.find(r => r.id === dev.roleId);
    // Filter by role name 'Dev' or ID 'role-dev'
    return role && (role.name === 'Dev' || role.id === 'role-dev');
  });
  
  const unassignedDevs = assignableDevs.filter(dev => !assignedDevIds.has(dev.id) && !absentDevIds.has(dev.id));
  const absentDevs = assignableDevs.filter(dev => absentDevIds.has(dev.id));

  const getRoleName = (roleId?: string) => {
    if (!roleId) return '';
    const role = (settings.roles || []).find(r => r.id === roleId);
    return role ? role.name : '';
  };

  const getRoleColor = (roleId?: string) => {
    if (!roleId) return 'transparent';
    const role = (settings.roles || []).find(r => r.id === roleId);
    return role ? role.color : 'transparent';
  };

  const timeOptions = generateTimeOptions();
  const durationOptions = generateDurationOptions();

  return (
    <div className="tracks-tab">
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'assignment' ? 'active' : ''}`}
          onClick={() => setActiveTab('assignment')}
        >
          日次アサイン
        </button>
        <button 
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          個人スケジュール
        </button>
        <button 
          className={`tab-btn ${activeTab === 'master' ? 'active' : ''}`}
          onClick={() => setActiveTab('master')}
        >
          マスタ設定
        </button>
      </div>

      <div className="tab-content-area">
        {activeTab === 'assignment' && (
          <>
            <div className="assignment-header">
              <div className="date-selector">
                <label>日付: </label>
                <input type="date" value={selectedDate} onChange={handleDateChange} />
              </div>
              <div className="assignment-actions">
                <button 
                  className={`btn ${getAssignmentStatus() === 'confirmed' ? 'btn-success' : 'btn-outline-secondary'}`}
                  onClick={toggleAssignmentStatus}
                >
                  {getAssignmentStatus() === 'confirmed' ? '確定済' : '未確定'}
                </button>
                <button className="btn btn-secondary" onClick={handleCopyPrevious}>前日をコピー</button>
                <button className="btn btn-primary" onClick={handleAutoAssign}>自動アサイン</button>
                <button className="btn btn-danger" onClick={handleClearAssignment}>クリア</button>
              </div>
            </div>

            <div className="assignment-container">
              <div className="left-column">
                <div 
                  className={`unassigned-area drop-zone ${selectedDevId && !assignedDevIds.has(selectedDevId) && !absentDevIds.has(selectedDevId) ? 'active-target' : ''}`}
                  onClick={() => handleTrackAreaClick('unassigned')}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'unassigned')}
                >
                  <h3>未割り当て ({unassignedDevs.length})</h3>
                  <div className="dev-list">
                    {unassignedDevs.map(dev => (
                      <div 
                        key={dev.id} 
                        className={`dev-card ${selectedDevId === dev.id ? 'selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleDevClick(dev.id); }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, dev.id)}
                        style={{ borderLeft: `4px solid ${getRoleColor(dev.roleId)}` }}
                      >
                        {dev.name} <span className="role-badge">{getRoleName(dev.roleId)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div 
                  className={`absent-area drop-zone ${selectedDevId && absentDevIds.has(selectedDevId) ? 'active-target' : ''}`}
                  onClick={() => handleTrackAreaClick('absent')}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'absent')}
                >
                  <h3>休み ({absentDevs.length})</h3>
                  <div className="dev-list">
                    {absentDevs.map(dev => (
                      <div 
                        key={dev.id} 
                        className={`dev-card absent ${selectedDevId === dev.id ? 'selected' : ''}`}
                        onClick={(e) => { e.stopPropagation(); handleDevClick(dev.id); }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, dev.id)}
                      >
                        {dev.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="right-column">
                <div className="tracks-grid">
                  {settings.tracks.filter(t => t.active).map(track => {
                    const trackDevIds = currentAssignment[track.id] || [];
                    const trackDevs = trackDevIds.map(id => settings.devs.find(d => d.id === id)).filter(Boolean) as Dev[];
                    
                    return (
                      <div 
                        key={track.id} 
                        className={`track-card drop-zone ${selectedDevId ? 'active-target' : ''}`}
                        onClick={() => handleTrackAreaClick(track.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, track.id)}
                      >
                        <div className="track-header">
                          <span className="track-name">{track.name}</span>
                          <span className="track-capacity">{trackDevs.length} / {track.capacity}</span>
                        </div>
                        <div className="track-members">
                          {trackDevs.map(dev => (
                            <div 
                              key={dev.id} 
                              className={`dev-card ${selectedDevId === dev.id ? 'selected' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleDevClick(dev.id); }}
                              draggable
                              onDragStart={(e) => handleDragStart(e, dev.id)}
                              style={{ borderLeft: `4px solid ${getRoleColor(dev.roleId)}` }}
                            >
                              {dev.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'schedule' && (
          <div className="section">
            <h2>個人スケジュール管理</h2>
            <div className="schedule-controls">
              <div className="form-group">
                <label>メンバー:</label>
                <select 
                  value={scheduleDevId} 
                  onChange={(e) => setScheduleDevId(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {settings.devs.map(dev => (
                    <option key={dev.id} value={dev.id}>{dev.name}</option>
                  ))}
                </select>
              </div>

              {scheduleDevId && (
                <div className="schedule-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label>日付:</label>
                      <input 
                        type="date" 
                        value={newSchedule.date} 
                        onChange={(e) => setNewSchedule({...newSchedule, date: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>タイプ:</label>
                      <select 
                        value={newSchedule.type} 
                        onChange={(e) => setNewSchedule({...newSchedule, type: e.target.value as PersonalScheduleType})}
                      >
                        <option value="fullDayOff">終日休暇</option>
                        <option value="partial">時間休/中抜け</option>
                        <option value="nonAgileTask">アジャイル以外のタスク</option>
                        <option value="personalErrand">所用</option>
                      </select>
                    </div>
                  </div>

                  {newSchedule.type !== 'fullDayOff' && (
                    <div className="form-row">
                      <div className="form-group">
                        <label>開始時刻:</label>
                        <select 
                          value={newSchedule.start} 
                          onChange={handleStartTimeChange}
                        >
                          {timeOptions.map(time => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>時間:</label>
                        <select 
                          value={scheduleDuration} 
                          onChange={handleDurationChange}
                        >
                          {durationOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>理由/メモ:</label>
                    <input 
                      type="text" 
                      value={newSchedule.reason} 
                      onChange={(e) => setNewSchedule({...newSchedule, reason: e.target.value})}
                      placeholder="例: 私用のため"
                    />
                  </div>

                  <button className="btn btn-primary" onClick={handleAddSchedule}>
                    スケジュール追加
                  </button>
                </div>
              )}
            </div>

            {scheduleDevId && (
              <div className="schedule-list">
                <h3>{settings.devs.find(d => d.id === scheduleDevId)?.name}のスケジュール</h3>
                {(settings.personalSchedules[scheduleDevId] || []).length === 0 ? (
                  <p className="no-items">スケジュールはありません</p>
                ) : (
                  <table className="schedule-table">
                    <thead>
                      <tr>
                        <th>日付</th>
                        <th>タイプ</th>
                        <th>時間</th>
                        <th>理由</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(settings.personalSchedules[scheduleDevId] || []).map((schedule, index) => (
                        <tr key={index}>
                          <td>{schedule.date}</td>
                          <td>
                            <span className={`badge ${
                              schedule.type === 'fullDayOff' ? 'badge-danger' : 
                              schedule.type === 'nonAgileTask' ? 'badge-info' :
                              schedule.type === 'personalErrand' ? 'badge-secondary' :
                              'badge-warning'
                            }`}>
                              {schedule.type === 'fullDayOff' ? '終日休暇' : 
                               schedule.type === 'nonAgileTask' ? 'アジャイル外' :
                               schedule.type === 'personalErrand' ? '所用' : '時間休'}
                            </span>
                          </td>
                          <td>
                            {schedule.type !== 'fullDayOff' ? `${schedule.start} - ${schedule.end}` : '-'}
                          </td>
                          <td>{schedule.reason}</td>
                          <td>
                            <button 
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRemoveSchedule(scheduleDevId, index)}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'master' && (
          <div className="master-settings">
            <div className="sub-tabs">
              <button 
                className={`sub-tab-btn ${activeMasterTab === 'members' ? 'active' : ''}`}
                onClick={() => setActiveMasterTab('members')}
              >
                メンバー
              </button>
              <button 
                className={`sub-tab-btn ${activeMasterTab === 'roles' ? 'active' : ''}`}
                onClick={() => setActiveMasterTab('roles')}
              >
                ロール
              </button>
              <button 
                className={`sub-tab-btn ${activeMasterTab === 'tracks' ? 'active' : ''}`}
                onClick={() => setActiveMasterTab('tracks')}
              >
                トラック
              </button>
            </div>

            {activeMasterTab === 'members' && (
              <div className="section">
                <h2>メンバー管理</h2>
                <div className="add-item">
                  <input
                    type="text"
                    value={newDevName}
                    onChange={(e) => setNewDevName(e.target.value)}
                    placeholder="メンバー名"
                  />
                  <select
                    value={newDevRoleId}
                    onChange={(e) => setNewDevRoleId(e.target.value)}
                  >
                    <option value="">ロール選択...</option>
                    {(settings.roles || []).map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={handleAddDev}>
                    追加
                  </button>
                </div>

                <div className="items-list">
                  {settings.devs.map((dev) => (
                    <div key={dev.id} className="item">
                      {editingDev?.id === dev.id ? (
                        <div className="edit-item">
                          <input
                            type="text"
                            value={editingDev.name}
                            onChange={(e) => setEditingDev({ ...editingDev, name: e.target.value })}
                          />
                          <select
                            value={editingDev.roleId || ''}
                            onChange={(e) => setEditingDev({ ...editingDev, roleId: e.target.value })}
                          >
                            <option value="">ロールなし</option>
                            {(settings.roles || []).map(role => (
                              <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                          </select>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleUpdateDev(dev.id, { name: editingDev.name, roleId: editingDev.roleId })}
                          >
                            保存
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingDev(null)}
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="item-name">
                            {dev.name} 
                            <span className="role-badge" style={{ backgroundColor: getRoleColor(dev.roleId) }}>
                              {getRoleName(dev.roleId)}
                            </span>
                          </span>
                          <div className="item-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingDev(dev)}
                            >
                              編集
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleRemoveDev(dev.id)}
                            >
                              削除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeMasterTab === 'roles' && (
              <div className="section">
                <h2>ロール管理</h2>
                <div className="add-item">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="ロール名 (例: PM, Designer)"
                  />
                  <input
                    type="color"
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleAddRole}>
                    追加
                  </button>
                </div>

                <div className="items-list">
                  {(settings.roles || []).map((role) => (
                    <div key={role.id} className="item">
                      {editingRole?.id === role.id ? (
                        <div className="edit-item">
                          <input
                            type="text"
                            value={editingRole.name}
                            onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                          />
                          <input
                            type="color"
                            value={editingRole.color}
                            onChange={(e) => setEditingRole({ ...editingRole, color: e.target.value })}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleUpdateRole(role.id, { name: editingRole.name, color: editingRole.color })}
                          >
                            保存
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingRole(null)}
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="item-name">
                            <span className="color-dot" style={{ backgroundColor: role.color }}></span>
                            {role.name}
                          </span>
                          <div className="item-actions">
                            {role.id !== 'role-pm' && role.id !== 'role-dev' && (
                              <>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditingRole(role)}
                                >
                                  編集
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleRemoveRole(role.id)}
                                >
                                  削除
                                </button>
                              </>
                            )}
                            {(role.id === 'role-pm' || role.id === 'role-dev') && (
                                <span className="fixed-role-label">固定ロール</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeMasterTab === 'tracks' && (
              <div className="section">
                <h2>トラック管理</h2>
                <div className="add-item">
                  <input
                    type="text"
                    value={newTrackName}
                    onChange={(e) => setNewTrackName(e.target.value)}
                    placeholder="トラック名"
                  />
                  <button className="btn btn-primary" onClick={handleAddTrack}>
                    追加
                  </button>
                </div>
                <div className="items-list">
                  {settings.tracks.map((track) => (
                    <div key={track.id} className={`item ${!track.active ? 'inactive' : ''}`}>
                      {editingTrack?.id === track.id ? (
                        <div className="edit-item">
                          <input
                            type="text"
                            value={editingTrack.name}
                            onChange={(e) => setEditingTrack({ ...editingTrack, name: e.target.value })}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleUpdateTrack(track.id, { name: editingTrack.name })}
                          >
                            保存
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingTrack(null)}
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="track-info">
                            <span className="item-name">{track.name}</span>
                            <span className="track-meta">
                              {track.active ? '有効' : '無効'}
                            </span>
                          </div>
                          <div className="item-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingTrack(track)}
                            >
                              編集
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleToggleTrackActive(track.id)}
                            >
                              {track.active ? '無効化' : '有効化'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TracksTab;
