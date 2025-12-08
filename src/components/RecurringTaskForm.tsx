import React, { useState } from 'react';
import { RecurringTask, RecurringRule, TaskStatus, Settings, Dev, DevMode, Task } from '../models/types';

// --- Editor Component ---

interface TaskEditorProps {
  initialData?: RecurringTask;
  settings: Settings;
  onSave: (task: RecurringTask) => void;
  onCancel: () => void;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ initialData, settings, onSave, onCancel }) => {
  // Task Template State
  const [title, setTitle] = useState(initialData?.template.title || '');
  const [summary, setSummary] = useState(initialData?.template.summary || '');
  const [externalLink, setExternalLink] = useState(initialData?.template.externalLink || '');
  const [startTime, setStartTime] = useState(initialData?.template.time?.startTime || '');
  const [duration, setDuration] = useState(initialData?.template.time?.duration || 60);
  const [status, setStatus] = useState<TaskStatus>(initialData?.template.status || 'Planned');

  // Roles State
  const [roles, setRoles] = useState<Task['roles']>(initialData?.template.roles || {
    pmId: undefined,
    designerIds: [],
    devPlan: {
      phase: 'Draft',
      mode: 'NoDev',
      requiredTrackCount: 0,
      assignedTrackIds: []
    }
  });
  const [externalParticipants, setExternalParticipants] = useState<Task['externalParticipants']>(initialData?.template.externalParticipants || []);

  // Rule State
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(initialData?.rule.frequency || 'weekly');
  const [weekDays, setWeekDays] = useState<number[]>(initialData?.rule.weekDays || []);
  const [monthDayType, setMonthDayType] = useState<'startOfMonth' | 'endOfMonth' | 'specificDay'>(initialData?.rule.monthDayType || 'startOfMonth');
  const [weekNumber, setWeekNumber] = useState(initialData?.rule.weekNumber || 1);
  const [dayOfWeek, setDayOfWeek] = useState(initialData?.rule.dayOfWeek || 1); // 1=Mon
  const [intervalMonths, setIntervalMonths] = useState(initialData?.rule.intervalMonths || 1);
  const [validUntil, setValidUntil] = useState(initialData?.rule.validUntil || '');
  const [hasExpiration, setHasExpiration] = useState(!!initialData?.rule.validUntil);
  const [isSaving, setIsSaving] = useState(false);

  const generateTimeOptions = () => {
    const options = [];
    options.push(<option key="unspecified" value="">未定</option>);
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        options.push(<option key={timeStr} value={timeStr}>{timeStr}</option>);
      }
    }
    return options;
  };

  const handleWeekDayChange = (day: number) => {
    if (weekDays.includes(day)) {
      setWeekDays(weekDays.filter(d => d !== day));
    } else {
      setWeekDays([...weekDays, day]);
    }
  };

  const handleRoleChange = (dev: Dev, checked: boolean) => {
    const isPm = dev.roleId === 'role-pm';
    
    if (isPm) {
      setRoles({
        ...roles,
        pmId: checked ? dev.id : (roles.pmId === dev.id ? undefined : roles.pmId)
      });
    } else {
      const currentDesigners = roles.designerIds || [];
      let newDesigners;
      if (checked) {
        newDesigners = [...currentDesigners, dev.id];
      } else {
        newDesigners = currentDesigners.filter(id => id !== dev.id);
      }
      setRoles({
        ...roles,
        designerIds: newDesigners
      });
    }
  };

  const getRoleName = (roleId: string | undefined) => {
    if (!roleId) return 'Unknown';
    const role = settings.roles.find(r => r.id === roleId);
    return role ? role.name : 'Unknown';
  };

  const nonDevs = settings.devs.filter(d => d.roleId !== 'role-dev');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      alert('タイトルは必須です');
      return;
    }

    if (frequency === 'weekly' && weekDays.length === 0) {
      alert('曜日を選択してください');
      return;
    }

    const rule: RecurringRule = {
      frequency,
      intervalMonths,
      validUntil: hasExpiration ? validUntil : null,
    };

    if (frequency === 'weekly') {
      rule.weekDays = weekDays;
    } else {
      rule.monthDayType = monthDayType;
      if (monthDayType === 'specificDay') {
        rule.weekNumber = weekNumber;
        rule.dayOfWeek = dayOfWeek;
      }
    }

    const newTask: RecurringTask = {
      id: initialData?.id || crypto.randomUUID(),
      template: {
        title,
        summary,
        externalLink,
        status,
        time: {
          ...(startTime ? { startTime } : {}),
          duration
        },
        roles,
        externalParticipants,
        constraints: initialData?.template.constraints || {
            timeLocked: false,
            rolesLocked: false,
            externalFixed: false
        }
      },
      rule
    };

    setIsSaving(true);
    // Small delay to prevent double clicks if onSave is sync (though it's likely async in App)
    // But better to rely on parent handling or just disable button.
    // Since onSave might trigger a re-render of parent which unmounts this, 
    // we just set state.
    
    // Wrap in try-finally if onSave returns a promise, but here it returns void in props definition.
    // However, in App.tsx it is async. 
    // We can't await it here easily without changing prop type.
    // But we can just disable the button.
    onSave(newTask);
  };

  return (
    <div className="recurring-task-form" style={{ padding: '20px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
      <h3>{initialData ? '定期タスク編集' : '定期タスク登録'}</h3>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={isSaving} style={{ border: 'none', padding: 0, margin: 0 }}>
        {/* Task Info */}
        <div className="form-group">
          <label>タイトル *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} required style={{ width: '100%', padding: '8px' }} />
        </div>
        <div className="form-group">
          <label>概要</label>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} style={{ width: '100%', padding: '8px' }} />
        </div>
        <div className="form-group">
          <label>URL</label>
          <input type="url" value={externalLink} onChange={e => setExternalLink(e.target.value)} style={{ width: '100%', padding: '8px' }} />
        </div>
        <div className="form-row" style={{ display: 'flex', gap: '10px' }}>
          <div className="form-group">
            <label>開始時刻</label>
            <select value={startTime} onChange={e => setStartTime(e.target.value)}>
              {generateTimeOptions()}
            </select>
          </div>
          <div className="form-group">
            <label>所要時間(分)</label>
            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} step="5" min="5" />
          </div>
          <div className="form-group">
            <label>ステータス</label>
            <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
              <option value="Draft">ドラフト</option>
              <option value="Planned">計画済</option>
              <option value="Done">完了</option>
            </select>
          </div>
        </div>

        <hr />

        {/* Roles & Dev Plan */}
        <div className="form-section" style={{ marginTop: '15px' }}>
          <h4>ロール割り当て</h4>
          <div className="form-group">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {nonDevs.length > 0 ? nonDevs.map(dev => {
                const isPm = dev.roleId === 'role-pm';
                const isChecked = isPm 
                  ? roles.pmId === dev.id 
                  : (roles.designerIds || []).includes(dev.id);
                
                return (
                  <label key={dev.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#eee', padding: '5px 10px', borderRadius: '4px' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleRoleChange(dev, e.target.checked)}
                    />
                    {dev.name} <span style={{ fontSize: '0.8em', color: '#666' }}>({getRoleName(dev.roleId)})</span>
                  </label>
                );
              }) : <p className="no-data">割り当て可能なメンバーがいません</p>}
            </div>
          </div>
        </div>

        <div className="form-section" style={{ marginTop: '15px' }}>
          <h4>外部チーム連携</h4>
          <div className="form-group">
            <div className="checkbox-group">
              {settings.externalTeams.length > 0 ? settings.externalTeams.map(team => {
                const participant = externalParticipants.find(p => p.teamId === team.id);
                const isSelected = !!participant;
                
                return (
                  <div key={team.id} className="external-team-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <label className="checkbox-label team-name-label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            // Add
                            setExternalParticipants([
                              ...externalParticipants,
                              { teamId: team.id, required: false, timeFixed: false }
                            ]);
                          } else {
                            // Remove
                            setExternalParticipants(externalParticipants.filter(p => p.teamId !== team.id));
                          }
                        }}
                      />
                      <span>{team.name}</span>
                    </label>
                    
                    {isSelected && (
                      <label className="option-label required-label" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9em' }}>
                        <input
                          type="checkbox"
                          checked={participant?.required || false}
                          onChange={(e) => {
                            const updated = externalParticipants.map(p => 
                              p.teamId === team.id ? { ...p, required: e.target.checked } : p
                            );
                            setExternalParticipants(updated);
                          }}
                        />
                        <span className="small-text">必須</span>
                      </label>
                    )}
                  </div>
                ); 
              }) : <p className="no-data">外部チームが設定されていません</p>}
            </div>
          </div>
        </div>

        <div className="form-section" style={{ marginTop: '15px' }}>
          <h4>開発計画</h4>
          <div className="form-group">
            <label>開発リソース</label>
            <select
              value={`${roles.devPlan.mode}:${roles.devPlan.mode === 'Tracks' ? roles.devPlan.requiredTrackCount : 0}`}
              onChange={(e) => {
                const [mode, countStr] = e.target.value.split(':');
                setRoles({
                  ...roles,
                  devPlan: {
                    ...roles.devPlan,
                    mode: mode as DevMode,
                    requiredTrackCount: parseInt(countStr),
                  },
                });
              }}
              style={{ marginLeft: '10px', padding: '5px' }}
            >
              <option value="NoDev:0">開発なし</option>
              {settings.tracks.slice(0, -1).map((_, i) => {
                const count = i + 1;
                return (
                  <option key={count} value={`Tracks:${count}`}>
                    {count} Track{count > 1 ? 's' : ''}
                  </option>
                );
              })}
              <option value="AllDev:0">全開発者</option>
            </select>
          </div>
        </div>

        <hr />

        {/* Recurrence Rule */}
        <h4>繰り返し設定</h4>
        <div className="form-group">
          <label>頻度</label>
          <div style={{ display: 'flex', gap: '20px' }}>
            <label>
              <input type="radio" checked={frequency === 'weekly'} onChange={() => setFrequency('weekly')} /> 毎週
            </label>
            <label>
              <input type="radio" checked={frequency === 'monthly'} onChange={() => setFrequency('monthly')} /> 毎月
            </label>
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className="form-group">
            <label>曜日</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {['日', '月', '火', '水', '木', '金', '土'].map((day, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={weekDays.includes(index)}
                    onChange={() => handleWeekDayChange(index)}
                  /> {day}
                </label>
              ))}
            </div>
          </div>
        )}

        {frequency === 'monthly' && (
          <div className="form-group">
            <label>設定</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label>
                <input type="radio" checked={monthDayType === 'startOfMonth'} onChange={() => setMonthDayType('startOfMonth')} /> 月初 (1日)
              </label>
              <label>
                <input type="radio" checked={monthDayType === 'endOfMonth'} onChange={() => setMonthDayType('endOfMonth')} /> 月末
              </label>
              <label>
                <input type="radio" checked={monthDayType === 'specificDay'} onChange={() => setMonthDayType('specificDay')} /> 指定:
                <select 
                  disabled={monthDayType !== 'specificDay'} 
                  value={weekNumber} 
                  onChange={e => setWeekNumber(Number(e.target.value))}
                  style={{ marginLeft: '5px', marginRight: '5px' }}
                >
                  <option value={1}>第1</option>
                  <option value={2}>第2</option>
                  <option value={3}>第3</option>
                  <option value={4}>第4</option>
                  <option value={5}>第5</option>
                </select>
                <select 
                  disabled={monthDayType !== 'specificDay'} 
                  value={dayOfWeek} 
                  onChange={e => setDayOfWeek(Number(e.target.value))}
                >
                  <option value={0}>日曜日</option>
                  <option value={1}>月曜日</option>
                  <option value={2}>火曜日</option>
                  <option value={3}>水曜日</option>
                  <option value={4}>木曜日</option>
                  <option value={5}>金曜日</option>
                  <option value={6}>土曜日</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: '10px' }}>
                <label>間隔: </label>
                <input type="number" value={intervalMonths} onChange={e => setIntervalMonths(Number(e.target.value))} min="1" style={{ width: '50px' }} /> ヶ月ごと
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginTop: '15px' }}>
          <label>
            <input type="checkbox" checked={hasExpiration} onChange={e => setHasExpiration(e.target.checked)} /> 有効期限を設定する
          </label>
          {hasExpiration && (
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ marginLeft: '10px' }} />
          )}
        </div>

        <div className="actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} className="btn" disabled={isSaving}>キャンセル</button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
        </fieldset>
      </form>
    </div>
  );
};

// --- Manager Component ---

interface RecurringTaskManagerProps {
  settings: Settings;
  onSave: (task: RecurringTask) => void;
  onDelete: (taskId: string) => void;
  onReapply: (onProgress: (message: string) => void) => Promise<void>;
  onCancel: () => void;
}

const RecurringTaskManager: React.FC<RecurringTaskManagerProps> = ({ settings, onSave, onDelete, onReapply, onCancel }) => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingTask, setEditingTask] = useState<RecurringTask | undefined>(undefined);
  const [isReapplying, setIsReapplying] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  const handleCreate = () => {
    setEditingTask(undefined);
    setView('form');
  };

  const handleEdit = (task: RecurringTask) => {
    setEditingTask(task);
    setView('form');
  };

  const handleDelete = (taskId: string) => {
    if (confirm('この定期タスクを削除してもよろしいですか？')) {
      onDelete(taskId);
    }
  };

  const handleReapplyClick = async () => {
    if (isReapplying) return;
    setIsReapplying(true);
    setProgressMessage('準備中...');
    try {
      await onReapply((msg) => setProgressMessage(msg));
    } finally {
      setIsReapplying(false);
      setProgressMessage('');
    }
  };

  const handleSaveInternal = (task: RecurringTask) => {
    onSave(task);
    setView('list');
  };

  if (view === 'form') {
    return (
      <TaskEditor 
        initialData={editingTask} 
        settings={settings}
        onSave={handleSaveInternal} 
        onCancel={() => setView('list')} 
      />
    );
  }

  return (
    <div className="recurring-task-manager" style={{ padding: '20px', background: '#fff', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>定期タスク管理</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isReapplying && <span style={{ fontSize: '0.8em', color: '#666' }}>{progressMessage}</span>}
          <button 
            className="btn" 
            onClick={handleReapplyClick} 
            disabled={isReapplying}
            title="カレンダー上のタスクをチェックし、不足分を追加します"
          >
            {isReapplying ? '処理中...' : 'タスク再設定'}
          </button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={isReapplying}>＋ 新規作成</button>
        </div>
      </div>

      <div className="task-list">
        {(!settings.recurringTasks || settings.recurringTasks.length === 0) ? (
          <p>定期タスクは登録されていません。</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>タイトル</th>
                <th style={{ padding: '10px' }}>頻度</th>
                <th style={{ padding: '10px' }}>アクション</th>
              </tr>
            </thead>
            <tbody>
              {settings.recurringTasks.map(task => (
                <tr key={task.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{task.template.title}</td>
                  <td style={{ padding: '10px' }}>
                    {task.rule.frequency === 'weekly' ? '毎週' : '毎月'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <button className="btn small" onClick={() => handleEdit(task)} style={{ marginRight: '5px' }}>編集</button>
                    <button className="btn small danger" onClick={() => handleDelete(task.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <button className="btn" onClick={onCancel}>閉じる</button>
      </div>
    </div>
  );
};

export default RecurringTaskManager;
