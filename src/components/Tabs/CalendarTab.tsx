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
      alert('Calendar generated successfully!');
    } catch (error) {
      console.error('Error generating calendar:', error);
      alert('Failed to generate calendar');
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
      alert('Failed to navigate to previous month');
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
      alert('Failed to navigate to next month');
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
      <h2>Calendar Management</h2>
      
      <div className="calendar-info">
        <p>
          Current base month: <strong>{formatMonth(settings.baseMonth)}</strong>
        </p>
        <p>
          The calendar displays 3 months: {formatMonth(getPreviousMonth(settings.baseMonth))},{' '}
          {formatMonth(settings.baseMonth)}, and {formatMonth(getNextMonth(settings.baseMonth))}
        </p>
      </div>

      <div className="calendar-actions">
        <button
          className="btn btn-primary"
          onClick={handleGenerateCalendar}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate/Update Calendar'}
        </button>
      </div>

      <div className="calendar-navigation">
        <h3>Navigate Calendar</h3>
        <div className="nav-buttons">
          <button
            className="btn btn-secondary"
            onClick={handlePreviousMonth}
            disabled={loading}
          >
            ← Previous Month
          </button>
          <div className="current-month">{formatMonth(settings.baseMonth)}</div>
          <button
            className="btn btn-secondary"
            onClick={handleNextMonth}
            disabled={loading}
          >
            Next Month →
          </button>
        </div>
      </div>

      <div className="calendar-description">
        <h3>About the Calendar</h3>
        <ul>
          <li>The calendar is generated on the Miro board as frames</li>
          <li>Each month is displayed as a separate frame</li>
          <li>Rows represent: PM, Designer, and active Tracks</li>
          <li>Tasks will be placed in the appropriate date and row cells</li>
          <li>Use the navigation buttons to move between months</li>
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
