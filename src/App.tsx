import React, { useState, useEffect } from 'react';
import { Settings } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import './App.css';

type TabType = 'tasks' | 'calendar' | 'tracks' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);
      setLoading(false);
    };
    init();
  }, []);

  const handleSettingsUpdate = async (newSettings: Settings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  if (loading || !settings) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <div className="tabs">
        <button
          className={activeTab === 'tasks' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
        </button>
        <button
          className={activeTab === 'calendar' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
        <button
          className={activeTab === 'tracks' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tracks')}
        >
          Tracks & Devs
        </button>
        <button
          className={activeTab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'calendar' && (
          <CalendarTab
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
          />
        )}
        {activeTab === 'tracks' && (
          <TracksTab
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onSettingsUpdate={handleSettingsUpdate}
          />
        )}
      </div>
    </div>
  );
};

export default App;
