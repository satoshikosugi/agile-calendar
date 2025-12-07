import React, { useState } from 'react';
import { RecurringTask, RecurringRule, TaskStatus } from '../models/types';

interface RecurringTaskFormProps {
  onSave: (task: RecurringTask) => void;
  onCancel: () => void;
}

const RecurringTaskForm: React.FC<RecurringTaskFormProps> = ({ onSave, onCancel }) => {
  // Task Template State
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [status, setStatus] = useState<TaskStatus>('Planned');

  // Rule State
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [monthDayType, setMonthDayType] = useState<'startOfMonth' | 'endOfMonth' | 'specificDay'>('startOfMonth');
  const [weekNumber, setWeekNumber] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1); // 1=Mon
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [validUntil, setValidUntil] = useState('');
  const [hasExpiration, setHasExpiration] = useState(false);

  const handleWeekDayChange = (day: number) => {
    if (weekDays.includes(day)) {
      setWeekDays(weekDays.filter(d => d !== day));
    } else {
      setWeekDays([...weekDays, day]);
    }
  };

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
      validUntil: hasExpiration ? validUntil : undefined,
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
      id: crypto.randomUUID(),
      template: {
        title,
        summary,
        externalLink,
        status,
        time: {
          startTime,
          duration
        },
        roles: {
            designerIds: [],
            devPlan: {
                phase: 'Draft',
                mode: 'NoDev',
                requiredTrackCount: 0,
                assignedTrackIds: []
            }
        },
        externalParticipants: [],
        constraints: {
            timeLocked: false,
            rolesLocked: false,
            externalFixed: false
        }
      },
      rule
    };

    onSave(newTask);
  };

  return (
    <div className="recurring-task-form" style={{ padding: '20px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #ddd' }}>
      <h3>定期タスク登録</h3>
      <form onSubmit={handleSubmit}>
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
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div className="form-group">
            <label>所要時間(分)</label>
            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} step="5" min="5" />
          </div>
          <div className="form-group">
            <label>ステータス</label>
            <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
              <option value="Draft">Draft</option>
              <option value="Planned">Planned</option>
              <option value="Done">Done</option>
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
          <button type="button" onClick={onCancel} className="btn">キャンセル</button>
          <button type="submit" className="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  );
};

export default RecurringTaskForm;
