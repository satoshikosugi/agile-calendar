import React, { useState, useEffect } from 'react';
import { Settings, Task } from '../models/types';
import { getCommonFreeSlots } from '../services/scheduleService';
import './ScheduleFinderModal.css';

interface ScheduleFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTime: (startTime: string) => void;
  task: Task;
  settings: Settings;
  date: string;
}

const ScheduleFinderModal: React.FC<ScheduleFinderModalProps> = ({
  isOpen,
  onClose,
  onSelectTime,
  task,
  settings,
  date
}) => {
  const [selectedDevIds, setSelectedDevIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<number>(30);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && task) {
      // Initialize selected devs based on task roles
      const initialDevs = new Set<string>();
      if (task.roles.pmId) initialDevs.add(task.roles.pmId);
      if (task.roles.designerIds) task.roles.designerIds.forEach(id => initialDevs.add(id));
      
      // If no one assigned, maybe select all? Or just PM?
      // Let's default to PM + Designers if present.
      
      setSelectedDevIds(Array.from(initialDevs));
      
      if (task.time?.duration) {
        setDuration(task.time.duration);
      }
    }
  }, [isOpen, task]);

  useEffect(() => {
    if (isOpen && date && selectedDevIds.length > 0) {
      const slots = getCommonFreeSlots(date, selectedDevIds, duration, settings);
      setAvailableSlots(slots);
    } else {
      setAvailableSlots([]);
    }
  }, [isOpen, date, selectedDevIds, duration, settings]);

  if (!isOpen) return null;

  const handleDevToggle = (devId: string) => {
    setSelectedDevIds(prev => 
      prev.includes(devId) 
        ? prev.filter(id => id !== devId)
        : [...prev, devId]
    );
  };

  const handleTimeClick = (time: string) => {
    onSelectTime(time);
    onClose();
  };

  // Group devs by role for display
  const pmDevs = settings.devs.filter(d => d.roleId === 'role-pm');
  const designerRole = settings.roles.find(r => r.name === 'Designer');
  const designerDevs = designerRole 
    ? settings.devs.filter(d => d.roleId === designerRole.id)
    : [];
  const otherDevs = settings.devs.filter(d => !pmDevs.includes(d) && !designerDevs.includes(d));

  return (
    <div className="modal-overlay">
      <div className="modal-content schedule-finder-modal">
        <div className="modal-header">
          <h3>空き時間を探す ({date})</h3>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="sidebar">
            <div className="section">
              <h4>所要時間</h4>
              <select 
                value={duration} 
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="duration-select"
              >
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <option key={m} value={m}>{m}分</option>
                ))}
              </select>
            </div>

            <div className="section">
              <h4>参加者を選択</h4>
              
              <div className="role-group">
                <h5>PM</h5>
                {pmDevs.map(dev => (
                  <label key={dev.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedDevIds.includes(dev.id)}
                      onChange={() => handleDevToggle(dev.id)}
                    />
                    {dev.name}
                  </label>
                ))}
              </div>

              <div className="role-group">
                <h5>Designers</h5>
                {designerDevs.map(dev => (
                  <label key={dev.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedDevIds.includes(dev.id)}
                      onChange={() => handleDevToggle(dev.id)}
                    />
                    {dev.name}
                  </label>
                ))}
              </div>

              <div className="role-group">
                <h5>Others</h5>
                {otherDevs.map(dev => (
                  <label key={dev.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedDevIds.includes(dev.id)}
                      onChange={() => handleDevToggle(dev.id)}
                    />
                    {dev.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="main-content">
            <h4>提案された開始時間</h4>
            {availableSlots.length > 0 ? (
              <div className="slots-grid">
                {availableSlots.map(time => (
                  <button 
                    key={time} 
                    className="time-slot-btn"
                    onClick={() => handleTimeClick(time)}
                  >
                    {time}
                  </button>
                ))}
              </div>
            ) : (
              <div className="no-slots">
                <p>条件に合う空き時間がありません。</p>
                <p>参加者を減らすか、日付を変更してください。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFinderModal;
