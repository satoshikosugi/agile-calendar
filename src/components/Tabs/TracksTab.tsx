import React, { useState } from 'react';
import { Settings, Dev, Track, DailyTrackAssignment } from '../../models/types';
import { generateAutoAssignment, copyPreviousDayAssignment } from '../../services/trackAssignmentService';
import './TracksTab.css';

interface TracksTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const TracksTab: React.FC<TracksTabProps> = ({ settings, onSettingsUpdate }) => {
  const [editingDev, setEditingDev] = useState<Dev | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [newDevName, setNewDevName] = useState('');
  const [newTrackName, setNewTrackName] = useState('');
  
  // Assignment State
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDevId, setSelectedDevId] = useState<string | null>(null);
  const [showMasterSettings, setShowMasterSettings] = useState(false);

  // Assignment Helpers
  const getCurrentAssignment = (): DailyTrackAssignment => {
    return settings.dailyTrackAssignments[selectedDate] || {};
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

  // Dev management
  const handleAddDev = () => {
    if (!newDevName.trim()) return;
    
    const newDev: Dev = {
      id: `d${Date.now()}`,
      name: newDevName,
    };
    
    const updatedSettings = {
      ...settings,
      devs: [...settings.devs, newDev],
    };
    
    onSettingsUpdate(updatedSettings);
    setNewDevName('');
  };

  const handleUpdateDev = (devId: string, newName: string) => {
    const updatedDevs = settings.devs.map(dev =>
      dev.id === devId ? { ...dev, name: newName } : dev
    );
    
    onSettingsUpdate({
      ...settings,
      devs: updatedDevs,
    });
    
    setEditingDev(null);
  };

  const handleRemoveDev = (devId: string) => {
    if (confirm('この開発者を削除してもよろしいですか？')) {
      const updatedSettings = {
        ...settings,
        devs: settings.devs.filter(dev => dev.id !== devId),
      };
      
      onSettingsUpdate(updatedSettings);
    }
  };

  // Track management
  const handleAddTrack = () => {
    if (!newTrackName.trim()) return;
    
    const newTrack: Track = {
      id: `t${Date.now()}`,
      name: newTrackName,
      role: 'Dev',
      capacity: 2,
      active: true,
    };
    
    const updatedSettings = {
      ...settings,
      tracks: [...settings.tracks, newTrack],
    };
    
    onSettingsUpdate(updatedSettings);
    setNewTrackName('');
  };

  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    const updatedTracks = settings.tracks.map(track =>
      track.id === trackId ? { ...track, ...updates } : track
    );
    
    onSettingsUpdate({
      ...settings,
      tracks: updatedTracks,
    });
    
    setEditingTrack(null);
  };

  const handleToggleTrackActive = (trackId: string) => {
    const updatedTracks = settings.tracks.map(track =>
      track.id === trackId ? { ...track, active: !track.active } : track
    );
    
    onSettingsUpdate({
      ...settings,
      tracks: updatedTracks,
    });
  };

  const currentAssignment = getCurrentAssignment();
  const assignedDevIds = getAssignedDevIds();
  const absentDevIds = new Set(currentAssignment['absent'] || []);
  const unassignedDevs = settings.devs.filter(dev => !assignedDevIds.has(dev.id) && !absentDevIds.has(dev.id));
  const absentDevs = settings.devs.filter(dev => absentDevIds.has(dev.id));

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

    // Remove from old location
    Object.keys(newAssignment).forEach(tid => {
      newAssignment[tid] = newAssignment[tid].filter(id => id !== devId);
    });

    // Add to new location
    if (targetId !== 'unassigned') {
      if (!newAssignment[targetId]) newAssignment[targetId] = [];
      newAssignment[targetId].push(devId);
    }

    // Clean up empty tracks (except 'absent' if we want to keep it even if empty, though not strictly necessary)
    Object.keys(newAssignment).forEach(tid => {
      if (newAssignment[tid].length === 0) delete newAssignment[tid];
    });

    updateAssignment(newAssignment);
    setSelectedDevId(null);
  };

  return (
    <div className="tracks-tab">
      <div className="assignment-header">
        <div className="date-selector">
          <label>日付: </label>
          <input type="date" value={selectedDate} onChange={handleDateChange} />
        </div>
        <div className="assignment-actions">
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
                >
                  {dev.name}
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

      <div className="master-settings-toggle">
        <button 
          className="btn btn-text" 
          onClick={() => setShowMasterSettings(!showMasterSettings)}
        >
          {showMasterSettings ? '▼ 設定を隠す' : '▶ 設定を表示（開発者・トラック管理）'}
        </button>
      </div>

      {showMasterSettings && (
        <div className="master-settings">
          <div className="section">
            <h2>開発者</h2>
            
            <div className="add-item">
              <input
                type="text"
                value={newDevName}
                onChange={(e) => setNewDevName(e.target.value)}
                placeholder="開発者名"
                onKeyPress={(e) => e.key === 'Enter' && handleAddDev()}
              />
              <button className="btn btn-primary" onClick={handleAddDev}>
                開発者追加
              </button>
            </div>

            <div className="items-list">
              {settings.devs.length === 0 ? (
                <p className="no-items">まだ開発者がいません。開始するには追加してください！</p>
              ) : (
                settings.devs.map((dev) => (
                  <div key={dev.id} className="item">
                    {editingDev?.id === dev.id ? (
                      <div className="edit-item">
                        <input
                          type="text"
                          value={editingDev.name}
                          onChange={(e) => setEditingDev({ ...editingDev, name: e.target.value })}
                          autoFocus
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleUpdateDev(dev.id, editingDev.name)}
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
                        <span className="item-name">{dev.name}</span>
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
                ))
              )}
            </div>
          </div>

          <div className="section">
            <h2>トラック</h2>
            
            <div className="add-item">
              <input
                type="text"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                placeholder="トラック名（例：トラック1）"
                onKeyPress={(e) => e.key === 'Enter' && handleAddTrack()}
              />
              <button className="btn btn-primary" onClick={handleAddTrack}>
                トラック追加
              </button>
            </div>

            <div className="items-list">
              {settings.tracks.length === 0 ? (
                <p className="no-items">まだトラックがありません。開始するには追加してください！</p>
              ) : (
                settings.tracks.map((track) => (
                  <div key={track.id} className={`item ${!track.active ? 'inactive' : ''}`}>
                    {editingTrack?.id === track.id ? (
                      <div className="edit-item">
                        <input
                          type="text"
                          value={editingTrack.name}
                          onChange={(e) => setEditingTrack({ ...editingTrack, name: e.target.value })}
                          autoFocus
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
                            キャパシティ: {track.capacity} | {track.active ? '有効' : '無効'}
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
                ))
              )}
            </div>
          </div>

          <div className="section">
            <h2>トラックと開発者について</h2>
            <ul className="info-list">
              <li>開発者（Dev）はタスクに取り組むチームメンバーです</li>
              <li>トラックは最大2名の開発者を含む作業単位です（ペアプログラミング）</li>
              <li>有効なトラックはカレンダーに表示され、タスクに割り当てることができます</li>
              <li>履歴データを保持するため、削除せずにトラックを無効化できます</li>
              <li>日毎のトラック割り当ては別途管理され、毎日開発者をトラックに割り当てます</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default TracksTab;
