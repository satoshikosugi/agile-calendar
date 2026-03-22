import React, { useState } from 'react';
import { Settings, ExternalTeam } from '../../models/types';
import { validateConnection, extractBoardId } from '../../services/miroApiService';
import './SettingsTab.css';

interface SettingsTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onSettingsUpdate }) => {
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<ExternalTeam | null>(null);
  const [miroToken, setMiroToken] = useState(settings.miroApiToken || '');
  const [miroBoardUrl, setMiroBoardUrl] = useState(settings.miroBoardId || '');
  const [miroValidating, setMiroValidating] = useState(false);
  const [miroValidationMsg, setMiroValidationMsg] = useState('');

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
        <h2>設定について</h2>
        <ul className="info-list">
          <li>外部チームは、タスクに参加する可能性のある他部署またはチームです</li>
          <li>設定はブラウザストレージに保存され、セッションをまたいで永続します</li>
          <li>基準月の変更は、表示されるカレンダーフレームに影響します</li>
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

      <div className="section">
        <h2>🔗 Miro連携</h2>
        <p className="help-text" style={{ marginBottom: '16px' }}>
          カレンダー生成や便利ツールをMiroボードで使用するには、Miro API トークンとボード URL を設定してください。
          <br />
          API トークンは <a href="https://developers.miro.com/docs/rest-api-build-your-first-hello-world-app#step-3-get-your-access-token" target="_blank" rel="noreferrer">Miro 開発者ポータル</a> から取得できます。
        </p>

        <div className="form-group">
          <label>Miro API トークン</label>
          <input
            type="password"
            value={miroToken}
            onChange={(e) => setMiroToken(e.target.value)}
            placeholder="eyJtaXJvLm9yaWdpbi..."
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
          />
          <p className="help-text">個人アクセストークン (PAT) を入力してください。</p>
        </div>

        <div className="form-group">
          <label>Miro ボード URL またはボードID</label>
          <input
            type="text"
            value={miroBoardUrl}
            onChange={(e) => setMiroBoardUrl(e.target.value)}
            placeholder="https://miro.com/app/board/uXjVNXXXXXX= またはボードID"
            style={{ width: '100%' }}
          />
          <p className="help-text">MiroボードのURLをそのまま貼り付けるか、ボードIDのみ入力してください。</p>
        </div>

        {miroValidationMsg && (
          <p style={{
            padding: '8px 12px',
            borderRadius: '4px',
            backgroundColor: miroValidationMsg.startsWith('✅') ? '#d4edda' : '#f8d7da',
            color: miroValidationMsg.startsWith('✅') ? '#155724' : '#721c24',
            fontSize: '14px',
            marginBottom: '12px',
          }}>
            {miroValidationMsg}
          </p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={miroValidating || !miroToken.trim() || !miroBoardUrl.trim()}
            onClick={async () => {
              setMiroValidating(true);
              setMiroValidationMsg('');
              try {
                const boardId = extractBoardId(miroBoardUrl);
                const boardName = await validateConnection(boardId, miroToken.trim());
                setMiroValidationMsg(`✅ 接続成功: "${boardName}"`);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setMiroValidationMsg(`❌ 接続失敗: ${msg}`);
              } finally {
                setMiroValidating(false);
              }
            }}
          >
            {miroValidating ? '確認中...' : '接続テスト'}
          </button>

          <button
            className="btn btn-primary btn-sm"
            disabled={!miroToken.trim() || !miroBoardUrl.trim()}
            onClick={() => {
              onSettingsUpdate({
                ...settings,
                miroApiToken: miroToken.trim(),
                miroBoardId: miroBoardUrl.trim(),
              });
              setMiroValidationMsg('✅ 設定を保存しました');
            }}
          >
            Miro設定を保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
