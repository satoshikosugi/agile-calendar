import React, { useState } from 'react';
import { Settings, Dev, Track } from '../../models/types';
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

  return (
    <div className="tracks-tab">
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
  );
};

export default TracksTab;
