import React, { useState, useRef } from 'react';
import { Settings } from '../../models/types';
import { generateCalendar } from '../../services/calendarLayoutService';
import { rearrangeTasksForMonth } from '../../services/tasksService';
import './CalendarTab.css';

interface CalendarTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const CalendarTab: React.FC<CalendarTabProps> = ({ settings }) => {
  const [targetMonth, setTargetMonth] = useState(settings.baseMonth);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRearranging, setIsRearranging] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleGenerateCalendar = async () => {
    if (!targetMonth) return;
    setIsGenerating(true);
    try {
      await generateCalendar(targetMonth, settings);
      alert(`${targetMonth}のカレンダーを表示しました`);
    } catch (error) {
      console.error(error);
      alert('カレンダー生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRearrangeTasks = async () => {
    if (!targetMonth) return;
    
    // Cancel previous if any
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setIsRearranging(true);
    try {
      await rearrangeTasksForMonth(targetMonth, controller.signal);
      alert(`${targetMonth}のタスクを再配置しました`);
    } catch (error: any) {
      if (error.message === 'Operation cancelled') {
          console.log('Rearrange cancelled');
          alert('タスク再配置を中断しました');
      } else {
          console.error(error);
          alert('タスク再配置に失敗しました: ' + error.message);
      }
    } finally {
      setIsRearranging(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
  };

  return (
    <div className="calendar-tab">
      <h2>カレンダー操作</h2>
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
          
          <div className="action-buttons" style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
            <div className="action-item">
              <button 
                className="btn btn-primary" 
                onClick={handleGenerateCalendar}
                disabled={isGenerating}
                style={{ width: '100%', marginBottom: '5px' }}
              >
                {isGenerating ? '生成中...' : 'カレンダー生成'}
              </button>
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
                    style={{ width: '100%', marginBottom: '5px', backgroundColor: '#dc3545', color: 'white' }}
                  >
                    停止
                  </button>
              ) : (
                  <button 
                    className="btn btn-secondary" 
                    onClick={handleRearrangeTasks}
                    disabled={isGenerating}
                    style={{ width: '100%', marginBottom: '5px' }}
                  >
                    タスク再配置
                  </button>
              )}
              <p className="help-text" style={{ margin: '0', fontSize: '0.9em', color: '#666' }}>
                指定した月のタスク配置を整理します。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarTab;
