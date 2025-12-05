import React, { useState } from 'react';
import { Settings, ExternalTeam } from '../../models/types';
import './SettingsTab.css';

interface SettingsTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onSettingsUpdate }) => {
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<ExternalTeam | null>(null);

  const handleAddExternalTeam = () => {
    if (!newTeamName.trim()) return;
    
    const newTeam: ExternalTeam = {
      id: `team${Date.now()}`,
      name: newTeamName,
    };
    
    const updatedSettings = {
      ...settings,
      externalTeams: [...settings.externalTeams, newTeam],
    };
    
    onSettingsUpdate(updatedSettings);
    setNewTeamName('');
  };

  const handleUpdateTeam = (teamId: string, newName: string) => {
    const updatedTeams = settings.externalTeams.map(team =>
      team.id === teamId ? { ...team, name: newName } : team
    );
    
    onSettingsUpdate({
      ...settings,
      externalTeams: updatedTeams,
    });
    
    setEditingTeam(null);
  };

  const handleRemoveTeam = (teamId: string) => {
    if (confirm('Are you sure you want to remove this external team?')) {
      const updatedSettings = {
        ...settings,
        externalTeams: settings.externalTeams.filter(team => team.id !== teamId),
      };
      
      onSettingsUpdate(updatedSettings);
    }
  };

  const handleUpdateBaseMonth = (newBaseMonth: string) => {
    onSettingsUpdate({
      ...settings,
      baseMonth: newBaseMonth,
    });
  };

  return (
    <div className="settings-tab">
      <div className="section">
        <h2>Calendar Settings</h2>
        
        <div className="form-group">
          <label>Base Month</label>
          <input
            type="month"
            value={settings.baseMonth}
            onChange={(e) => handleUpdateBaseMonth(e.target.value)}
          />
          <p className="help-text">
            The base month determines which 3-month period is displayed in the calendar.
          </p>
        </div>

        <div className="form-group">
          <label>View Span</label>
          <input
            type="number"
            value={settings.viewSpanMonths}
            readOnly
            disabled
          />
          <p className="help-text">
            Currently fixed at 3 months (baseMonth - 1, baseMonth, baseMonth + 1).
          </p>
        </div>
      </div>

      <div className="section">
        <h2>External Teams</h2>
        
        <div className="add-item">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name (e.g., Product A Team)"
            onKeyPress={(e) => e.key === 'Enter' && handleAddExternalTeam()}
          />
          <button className="btn btn-primary" onClick={handleAddExternalTeam}>
            Add Team
          </button>
        </div>

        <div className="items-list">
          {settings.externalTeams.length === 0 ? (
            <p className="no-items">No external teams yet. Add one if needed!</p>
          ) : (
            settings.externalTeams.map((team) => (
              <div key={team.id} className="item">
                {editingTeam?.id === team.id ? (
                  <div className="edit-item">
                    <input
                      type="text"
                      value={editingTeam.name}
                      onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                      autoFocus
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleUpdateTeam(team.id, editingTeam.name)}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingTeam(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="item-name">{team.name}</span>
                    <div className="item-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingTeam(team)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemoveTeam(team.id)}
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
        <h2>About Settings</h2>
        <ul className="info-list">
          <li>External teams are other departments or teams that may participate in tasks</li>
          <li>Settings are stored on the Miro board and persist across sessions</li>
          <li>Changes to the base month affect which calendar frames are visible</li>
        </ul>
      </div>

      <div className="section stats">
        <h2>Current Statistics</h2>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{settings.devs.length}</div>
            <div className="stat-label">Developers</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{settings.tracks.filter(t => t.active).length}</div>
            <div className="stat-label">Active Tracks</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{settings.externalTeams.length}</div>
            <div className="stat-label">External Teams</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
