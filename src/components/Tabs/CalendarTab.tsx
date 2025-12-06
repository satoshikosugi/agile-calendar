import React, { useState } from 'react';
import { Settings } from '../../models/types';
import {
  generateCalendar,
  navigateToPreviousMonth,
  navigateToNextMonth,
} from '../../services/calendarLayoutService';
import './CalendarTab.css';

interface CalendarTabProps {
  settings: Settings;
  onSettingsUpdate: (settings: Settings) => void;
}

const CalendarTab: React.FC<CalendarTabProps> = ({ settings, onSettingsUpdate }) => {
  const [loading, setLoading] = useState(false);

  const handleGenerateCalendar = async () => {
    setLoading(true);
    try {
      await generateCalendar(settings);
      alert('カレンダーを生成しました！');
    } catch (error) {
      console.error('Error generating calendar:', error);
      alert('カレンダーの生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = async () => {
    setLoading(true);
    try {
      const newSettings = await navigateToPreviousMonth(settings);
      onSettingsUpdate(newSettings);
    } catch (error) {
      console.error('Error navigating to previous month:', error);
      alert('前月への移動に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleNextMonth = async () => {
    setLoading(true);
    try {
      const newSettings = await navigateToNextMonth(settings);
      onSettingsUpdate(newSettings);
    } catch (error) {
      console.error('Error navigating to next month:', error);
      alert('次月への移動に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const formatMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-');
    return `${year}年 ${parseInt(month)}月`;
  };

  return (
    <div className="calendar-tab">
      <h2>カレンダー管理</h2>
      
      <div className="calendar-info">
        <p>
          現在の基準月: <strong>{formatMonth(settings.baseMonth)}</strong>
        </p>
        <p>
          カレンダーは3ヶ月表示します: {formatMonth(getPreviousMonth(settings.baseMonth))}、{' '}
          {formatMonth(settings.baseMonth)}、{formatMonth(getNextMonth(settings.baseMonth))}
        </p>
      </div>

      <div className="calendar-actions">
        <button
          className="btn btn-primary"
          onClick={handleGenerateCalendar}
          disabled={loading}
        >
          {loading ? '生成中...' : 'カレンダー生成/更新'}
        </button>
      </div>

      <div className="calendar-navigation">
        <h3>カレンダーナビゲーション</h3>
        <div className="nav-buttons">
          <button
            className="btn btn-secondary"
            onClick={handlePreviousMonth}
            disabled={loading}
          >
            ← 前月
          </button>
          <div className="current-month">{formatMonth(settings.baseMonth)}</div>
          <button
            className="btn btn-secondary"
            onClick={handleNextMonth}
            disabled={loading}
          >
            次月 →
          </button>
        </div>
      </div>

      <div className="calendar-description">
        <h3>カレンダーについて</h3>
        <ul>
          <li>カレンダーはMiroボード上にフレームとして生成されます</li>
          <li>各月は個別のフレームとして表示されます</li>
          <li>行はPM、デザイナー、および有効なトラックを表します</li>
          <li>タスクは適切な日付と行のセルに配置されます</li>
          <li>ナビゲーションボタンを使用して月間を移動します</li>
        </ul>
      </div>
    </div>
  );
};

// Helper functions
function getPreviousMonth(yearMonth: string): string {
  const date = new Date(yearMonth + '-01');
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().substring(0, 7);
}

function getNextMonth(yearMonth: string): string {
  const date = new Date(yearMonth + '-01');
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().substring(0, 7);
}

export default CalendarTab;
