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
    if (confirm('Are you sure you want to remove this developer?')) {
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
        <h2>Developers</h2>
        
        <div className="add-item">
          <input
            type="text"
            value={newDevName}
            onChange={(e) => setNewDevName(e.target.value)}
            placeholder="Developer name"
            onKeyPress={(e) => e.key === 'Enter' && handleAddDev()}
          />
          <button className="btn btn-primary" onClick={handleAddDev}>
            Add Dev
          </button>
        </div>

        <div className="items-list">
          {settings.devs.length === 0 ? (
            <p className="no-items">No developers yet. Add one to get started!</p>
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
                      Save
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingDev(null)}
                    >
                      Cancel
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
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemoveDev(dev.id)}
                      >
                        Remove
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
        <h2>Tracks</h2>
        
        <div className="add-item">
          <input
            type="text"
            value={newTrackName}
            onChange={(e) => setNewTrackName(e.target.value)}
            placeholder="Track name (e.g., Track1)"
            onKeyPress={(e) => e.key === 'Enter' && handleAddTrack()}
          />
          <button className="btn btn-primary" onClick={handleAddTrack}>
            Add Track
          </button>
        </div>

        <div className="items-list">
          {settings.tracks.length === 0 ? (
            <p className="no-items">No tracks yet. Add one to get started!</p>
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
                      Save
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingTrack(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="track-info">
                      <span className="item-name">{track.name}</span>
                      <span className="track-meta">
                        Capacity: {track.capacity} | {track.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="item-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingTrack(track)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggleTrackActive(track.id)}
                      >
                        {track.active ? 'Deactivate' : 'Activate'}
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
        <h2>About Tracks & Devs</h2>
        <ul className="info-list">
          <li>Developers (Devs) are team members who work on tasks</li>
          <li>Tracks are work units that can contain up to 2 developers (pair programming)</li>
          <li>Active tracks appear in the calendar and can be assigned to tasks</li>
          <li>You can deactivate tracks without deleting them to preserve historical data</li>
          <li>Daily track assignments will be managed separately to assign devs to tracks each day</li>
        </ul>
      </div>
    </div>
  );
};

export default TracksTab;
