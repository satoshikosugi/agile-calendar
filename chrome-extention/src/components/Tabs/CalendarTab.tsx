import React, { useState, useRef, useEffect } from 'react';
import { Settings, Task } from '../../models/types';
import { generateCalendar, hasMiroSettings } from '../../services/calendarLayoutService';
import { extractBoardId } from '../../services/miroApiService';
import { applyRecurringTasks } from '../../services/recurringTaskService';
import { rearrangeTasksForMonth } from '../../services/tasksService';
import { loadTasks, updateTask } from '../../services/storageService';
import './CalendarTab.css';

const COPY_RESET_MS = 2000;

interface CalendarTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const CalendarTab: React.FC<CalendarTabProps> = ({ settings }) => {
  const [targetMonth, setTargetMonth] = useState(settings.baseMonth);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Calendar drag-and-drop state
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const boardId = extractBoardId(settings.miroBoardId || '');
  const token = settings.miroApiToken || '';
  const miroConfigured = hasMiroSettings(token, boardId);

  // Load tasks for the displayed month whenever the month selector changes
  useEffect(() => {
    loadTasks().then((all) => {
      setCalendarTasks(all.filter((t) => t.date?.startsWith(targetMonth)));
    });
  }, [targetMonth]);

  // --- Calendar helpers ---
  const getMiniCalendarDays = (): (string | null)[] => {
    const [year, month] = targetMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0
    const days: (string | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const mm = String(month).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      days.push(`${year}-${mm}-${dd}`);
    }
    return days;
  };

  const isWeekend = (date: string): boolean => {
    const dow = new Date(date + 'T00:00:00').getDay();
    return dow === 0 || dow === 6;
  };

  // --- Drag-and-drop handlers ---
  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
  };

  const handleDayDragOver = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== date) setDragOverDate(date);
  };

  const handleDayDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      setDragOverDate(null);
    }
  };

  const handleDayDrop = async (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    setDraggingTaskId(null);
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = calendarTasks.find((t) => t.id === taskId);
    if (!task || task.date === targetDate) return;

    // Update task date in local storage
    await updateTask({ ...task, date: targetDate });

    // Reload tasks and refresh calendar view
    const all = await loadTasks();
    setCalendarTasks(all.filter((t) => t.date?.startsWith(targetMonth)));

    // Auto-sync to Miro if configured
    if (miroConfigured) {
      try {
        setProgressMessage('Miroに反映中...');
        const errs = await rearrangeTasksForMonth(targetMonth, settings, boardId, token, setProgressMessage);
        setProgressMessage('');
        if (errs.length > 0) setWarnings(errs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setWarnings([`Miro同期エラー: ${msg}`]);
        setProgressMessage('');
      }
    }
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverDate(null);
  };

  const getTargetMonths = () => {
    const months: string[] = [];
    const [year, month] = targetMonth.split('-').map(Number);
    for (let i = 0; i < settings.viewSpanMonths; i++) {
      const d = new Date(year, month - 1 + i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${d.getFullYear()}-${m}`);
    }
    return months;
  };

  const handleGenerateCalendar = async () => {
    if (!targetMonth) return;
    if (!miroConfigured) {
      alert('Miro API トークンとボードIDを設定タブで設定してください。');
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsGenerating(true);
    setProgressMessage('カレンダー生成を開始します...');
    setWarnings([]);
    setCopied(false);

    try {
      const result = await generateCalendar(targetMonth, settings, boardId, token, setProgressMessage);

      // Apply recurring tasks to local storage
      setProgressMessage('定期タスクを適用中...');
      await applyRecurringTasks(settings, getTargetMonths());

      setProgressMessage('');
      if (result.warnings.length > 0) {
        setWarnings(result.warnings);
      } else {
        alert(`${targetMonth} のカレンダーをMiroに生成しました。`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setProgressMessage('');
      setWarnings([`致命的なエラー: ${msg}`]);
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setIsRearranging(false);
    setProgressMessage('');
  };

  const handleRearrangeTasks = async () => {
    if (!miroConfigured) {
      alert('Miro API トークンとボードIDを設定タブで設定してください。');
      return;
    }

    setIsRearranging(true);
    setProgressMessage('タスク再配置を開始します...');
    setWarnings([]);
    setCopied(false);

    try {
      const errs = await rearrangeTasksForMonth(targetMonth, settings, boardId, token, setProgressMessage);
      setProgressMessage('');
      if (errs.length > 0) {
        setWarnings(errs);
      } else {
        alert(`${targetMonth} のタスクをMiroカレンダーに配置しました。`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setProgressMessage('');
      setWarnings([`致命的なエラー: ${msg}`]);
    } finally {
      setIsRearranging(false);
    }
  };

  const handleCopyErrors = () => {
    const text = warnings.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_RESET_MS);
    });
  };

  return (
    <div className="calendar-tab">
      <h2>カレンダー操作</h2>

      {!miroConfigured && (
        <div className="miro-warning">
          <p>⚠️ Miro API の設定が必要です。<strong>設定タブ</strong>で「Miro連携」セクションから API トークンとボード URL を設定してください。</p>
        </div>
      )}

      <div className="section">
        <div className="form-group">
          <label>対象月</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
            <input
              type="month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '16px' }}
            />
          </div>

          {progressMessage && (
            <div className="progress-message">
              <span className="spinner">⏳</span> {progressMessage}
            </div>
          )}

          <div className="action-buttons" style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
            <div className="action-item">
              {isGenerating ? (
                <button
                  className="btn btn-danger"
                  onClick={handleStop}
                  style={{ width: '100%', marginBottom: '5px', backgroundColor: '#dc3545', color: 'white', padding: '10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                >
                  停止
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateCalendar}
                  disabled={!miroConfigured || isRearranging}
                  style={{ width: '100%', marginBottom: '5px' }}
                >
                  カレンダー生成
                </button>
              )}
              <p className="help-text" style={{ margin: '0', fontSize: '0.9em', color: '#666' }}>
                指定した月のカレンダーフレームをMiroボード上に生成します。
                <br />
                ※すでにカレンダーが存在する場合は生成されません。
              </p>
            </div>

            <div className="action-item">
              {isRearranging ? (
                <button
                  className="btn btn-danger"
                  onClick={handleStop}
                  style={{ width: '100%', marginBottom: '5px', backgroundColor: '#dc3545', color: 'white', padding: '10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                >
                  停止
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={handleRearrangeTasks}
                  disabled={!miroConfigured || isGenerating}
                  style={{ width: '100%', marginBottom: '5px' }}
                >
                  タスク再配置
                </button>
              )}
              <p className="help-text" style={{ margin: '0', fontSize: '0.9em', color: '#666' }}>
                指定した月のタスクを付箋としてMiroカレンダーに配置・更新します。
              </p>
            </div>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="warning-box">
          <div className="warning-header">
            <strong>⚠️ {warnings.length} 件の問題が発生しました（カレンダーは部分的に生成されました）</strong>
            <button
              className="btn-copy"
              onClick={handleCopyErrors}
              title="エラー内容をクリップボードにコピー"
            >
              {copied ? '✅ コピー済み' : '📋 コピー'}
            </button>
          </div>
          <ul className="warning-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {miroConfigured && (
        <div className="miro-info">
          <p>✅ Miro接続設定済み</p>
          <p>ボードID: <code>{boardId}</code></p>
        </div>
      )}

      {/* Drag-and-drop task calendar */}
      <div className="section mini-calendar-section">
        <h3 className="mini-calendar-title">
          タスクカレンダー
          <span className="mini-calendar-hint">（タスクをドラッグして日付を変更{miroConfigured ? '・Miro自動同期' : ''}）</span>
        </h3>
        <div className="mini-calendar">
          <div className="mini-calendar-header">
            {['月', '火', '水', '木', '金', '土', '日'].map((d) => (
              <div key={d} className="mini-cal-dow">{d}</div>
            ))}
          </div>
          <div className="mini-calendar-grid">
            {getMiniCalendarDays().map((date, i) => (
              <div
                key={i}
                className={[
                  'mini-cal-cell',
                  !date ? 'mini-cal-empty' : '',
                  date && isWeekend(date) ? 'mini-cal-weekend' : '',
                  date && dragOverDate === date ? 'drag-over' : '',
                ].filter(Boolean).join(' ')}
                onDragOver={date ? (e) => handleDayDragOver(e, date) : undefined}
                onDragLeave={date ? handleDayDragLeave : undefined}
                onDrop={date ? (e) => handleDayDrop(e, date) : undefined}
              >
                {date && (
                  <>
                    <span className="mini-cal-day-num">{parseInt(date.split('-')[2])}</span>
                    <div className="mini-cal-tasks">
                      {calendarTasks
                        .filter((t) => t.date === date)
                        .map((task) => (
                          <div
                            key={task.id}
                            className={[
                              'mini-cal-task',
                              `status-${task.status.toLowerCase()}`,
                              draggingTaskId === task.id ? 'dragging' : '',
                            ].filter(Boolean).join(' ')}
                            draggable
                            onDragStart={(e) => handleTaskDragStart(e, task.id)}
                            onDragEnd={handleDragEnd}
                            title={`${task.title}${task.time?.startTime ? ' ' + task.time.startTime : ''}`}
                          >
                            {task.time?.startTime && (
                              <span className="task-chip-time">{task.time.startTime}</span>
                            )}
                            <span className="task-chip-title">{task.title}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarTab;
