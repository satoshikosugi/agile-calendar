import React, { useState, useEffect } from 'react';
import { Settings } from './models/types';
import { loadSettings, saveSettings } from './services/settingsService';
import TasksTab from './components/Tabs/TasksTab';
import CalendarTab from './components/Tabs/CalendarTab';
import TracksTab from './components/Tabs/TracksTab';
import SettingsTab from './components/Tabs/SettingsTab';
import { getMiro } from './miro';
import './App.css';

type TabType = 'tasks' | 'calendar' | 'tracks' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [miroReady, setMiroReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize Miro SDK first
        const miroInstance = await getMiro();
        
        // Check if we're using real Miro or mock
        const isRealMiro = miroInstance && typeof miroInstance.board?.getInfo === 'function';
        setMiroReady(isRealMiro);
        
        if (isRealMiro) {
          console.log('✅ Connected to Miro board');
        } else {
          console.log('📦 Using mock mode - data stored in browser');
        }
        
        // Then load settings
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);
      } catch (error) {
        console.error('❌ Initialization error:', error);
        // Continue with mock data
        const loadedSettings = await loadSettings();
        setSettings(loadedSettings);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSettingsUpdate = async (newSettings: Settings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  if (loading || !settings) {
    return <div className="loading">Miro SDKを初期化中...</div>;
  }

  return (
    <div className="app">
      {!miroReady && (
        <div style={{
          background: '#d1ecf1',
          padding: '10px',
          borderBottom: '1px solid #0c5460',
          textAlign: 'center',
          fontSize: '14px',
          color: '#0c5460',
        }}>
          📦 モックモード: データはブラウザに保存されます（Miroボードとは同期されません）
        </div>
      )}
      <div className="tabs">
        <button
          className={activeTab === 'tasks' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tasks')}
        >
          タスク
        </button>
        <button
          className={activeTab === 'calendar' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('calendar')}
        >
          カレンダー
        </button>
        <button
          className={activeTab === 'tracks' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('tracks')}
        >
          トラック & 開発者
        </button>
        <button
          className={activeTab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('settings')}
        >
          設定
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
