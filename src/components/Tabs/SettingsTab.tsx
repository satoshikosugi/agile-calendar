import React, { useState } from 'react';
import { Settings, ExternalTeam } from '../../models/types';
import { LLMConfig } from '../../models/llmTypes';
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
    if (confirm('この外部チームを削除してもよろしいですか？')) {
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

  const handleAddHoliday = () => {
    const dateInput = document.getElementById('new-holiday-date') as HTMLInputElement;
    const reasonInput = document.getElementById('new-holiday-reason') as HTMLInputElement;
    
    if (!dateInput.value) return;

    const newHoliday = {
      date: dateInput.value,
      reason: reasonInput.value || '非稼働日'
    };

    onSettingsUpdate({
      ...settings,
      projectHolidays: [...(settings.projectHolidays || []), newHoliday].sort((a, b) => a.date.localeCompare(b.date))
    });

    // Keep inputs for continuous entry
    // dateInput.value = '';
    // reasonInput.value = '';
  };

  const handleRemoveHoliday = (index: number) => {
    const updatedHolidays = [...(settings.projectHolidays || [])];
    updatedHolidays.splice(index, 1);
    onSettingsUpdate({
      ...settings,
      projectHolidays: updatedHolidays
    });
  };

  return (
    <div className="settings-tab">
      <div className="section">
        <h2>カレンダー設定</h2>
        
        <div className="form-group">
          <label>基準月</label>
          <input
            type="month"
            value={settings.baseMonth}
            onChange={(e) => handleUpdateBaseMonth(e.target.value)}
          />
          <p className="help-text">
            基準月により、カレンダーに表示される3ヶ月間が決まります。
          </p>
        </div>

        <div className="form-group">
          <label>表示期間</label>
          <input
            type="number"
            value={settings.viewSpanMonths}
            readOnly
            disabled
          />
          <p className="help-text">
            現在は3ヶ月固定です（基準月-1、基準月、基準月+1）。
          </p>
        </div>

        <div className="form-group">
          <label>プロジェクト非稼働日</label>
          <div className="holiday-input-group">
            <input type="date" id="new-holiday-date" />
            <input type="text" id="new-holiday-reason" placeholder="理由 (例: 祝日)" />
            <button className="btn btn-sm btn-primary" onClick={handleAddHoliday}>追加</button>
          </div>
          <div className="holiday-list">
            {(settings.projectHolidays || []).length === 0 ? (
              <p className="no-data">設定されていません</p>
            ) : (
              <ul>
                {settings.projectHolidays.map((h, i) => (
                  <li key={i}>
                    <span className="holiday-date">{h.date}</span>
                    <span className="holiday-reason">{h.reason}</span>
                    <button className="btn-icon-sm" onClick={() => handleRemoveHoliday(i)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>休憩時間</label>
          <div className="time-range-inputs">
            <input
              type="time"
              value={settings.breakTime?.startTime || '12:30'}
              onChange={(e) => onSettingsUpdate({
                ...settings,
                breakTime: {
                  startTime: e.target.value,
                  duration: settings.breakTime?.duration || 60
                }
              })}
            />
            <span>から</span>
            <input
              type="number"
              min="0"
              step="5"
              value={settings.breakTime?.duration || 60}
              onChange={(e) => onSettingsUpdate({
                ...settings,
                breakTime: {
                  startTime: settings.breakTime?.startTime || '12:30',
                  duration: parseInt(e.target.value) || 0
                }
              })}
              style={{ width: '60px' }}
            />
            <span>分間</span>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>外部チーム</h2>
        
        <div className="add-item">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="チーム名（例：プロダクトAチーム）"
            onKeyPress={(e) => e.key === 'Enter' && handleAddExternalTeam()}
          />
          <button className="btn btn-primary" onClick={handleAddExternalTeam}>
            チーム追加
          </button>
        </div>

        <div className="items-list">
          {settings.externalTeams.length === 0 ? (
            <p className="no-items">まだ外部チームがありません。必要に応じて追加してください！</p>
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
                      保存
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditingTeam(null)}
                    >
                      キャンセル
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
                        編集
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRemoveTeam(team.id)}
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
        <h2>🤖 LLM設定（生成AI）</h2>
        <p className="help-text">
          自然言語から図を生成するための LLM 接続設定です。
        </p>

        <div className="form-group">
          <label>LLM プロバイダー</label>
          <select
            value={settings.llmConfig?.provider || 'ollama'}
            onChange={(e) => {
              const provider = e.target.value as 'ollama' | 'openai';
              onSettingsUpdate({
                ...settings,
                llmConfig: {
                  ...(settings.llmConfig || {
                    endpoint: 'http://localhost:11434/api/generate',
                    model: 'llama3',
                    temperature: 0.7,
                    maxTokens: 2000,
                  }),
                  provider,
                },
              });
            }}
          >
            <option value="ollama">Ollama（ローカル）</option>
            <option value="openai" disabled>OpenAI（未実装）</option>
          </select>
        </div>

        <div className="form-group">
          <label>エンドポイントURL</label>
          <input
            type="text"
            value={settings.llmConfig?.endpoint || 'http://localhost:11434/api/generate'}
            onChange={(e) => {
              onSettingsUpdate({
                ...settings,
                llmConfig: {
                  ...(settings.llmConfig || {
                    provider: 'ollama',
                    model: 'llama3',
                    temperature: 0.7,
                    maxTokens: 2000,
                  }),
                  endpoint: e.target.value,
                },
              });
            }}
            placeholder="http://localhost:11434/api/generate"
          />
          <p className="help-text">
            Ollama の場合: http://localhost:11434/api/generate
          </p>
        </div>

        <div className="form-group">
          <label>モデル名</label>
          <input
            type="text"
            value={settings.llmConfig?.model || 'llama3'}
            onChange={(e) => {
              onSettingsUpdate({
                ...settings,
                llmConfig: {
                  ...(settings.llmConfig || {
                    provider: 'ollama',
                    endpoint: 'http://localhost:11434/api/generate',
                    temperature: 0.7,
                    maxTokens: 2000,
                  }),
                  model: e.target.value,
                },
              });
            }}
            placeholder="llama3, qwen2.5, deepseek-r1 など"
          />
          <p className="help-text">
            例: llama3, qwen2.5, deepseek-r1 など
          </p>
        </div>

        <div className="form-group">
          <label>Temperature</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={settings.llmConfig?.temperature || 0.7}
            onChange={(e) => {
              onSettingsUpdate({
                ...settings,
                llmConfig: {
                  ...(settings.llmConfig || {
                    provider: 'ollama',
                    endpoint: 'http://localhost:11434/api/generate',
                    model: 'llama3',
                    maxTokens: 2000,
                  }),
                  temperature: parseFloat(e.target.value),
                },
              });
            }}
          />
          <p className="help-text">
            0.0 〜 2.0（低いほど安定、高いほど創造的）
          </p>
        </div>

        <div className="form-group">
          <label>最大トークン数</label>
          <input
            type="number"
            step="100"
            min="500"
            max="8000"
            value={settings.llmConfig?.maxTokens || 2000}
            onChange={(e) => {
              onSettingsUpdate({
                ...settings,
                llmConfig: {
                  ...(settings.llmConfig || {
                    provider: 'ollama',
                    endpoint: 'http://localhost:11434/api/generate',
                    model: 'llama3',
                    temperature: 0.7,
                  }),
                  maxTokens: parseInt(e.target.value),
                },
              });
            }}
          />
          <p className="help-text">
            生成する最大トークン数（500 〜 8000）
          </p>
        </div>
      </div>

      <div className="section">
        <h2>設定について</h2>
        <ul className="info-list">
          <li>外部チームは、タスクに参加する可能性のある他部署またはチームです</li>
          <li>設定はMiroボードに保存され、セッションをまたいで永続します</li>
          <li>基準月の変更は、表示されるカレンダーフレームに影響します</li>
          <li>LLM設定を使用するには、「便利ツール」から「生成AI」機能を利用してください</li>
        </ul>
      </div>

      <div className="section stats">
        <h2>現在の統計</h2>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{settings.devs.length}</div>
            <div className="stat-label">開発者</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{settings.tracks.filter(t => t.active).length}</div>
            <div className="stat-label">有効トラック</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{settings.externalTeams.length}</div>
            <div className="stat-label">外部チーム</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
