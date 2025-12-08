import React from 'react';
import { Settings, Task } from '../models/types';
import { getDevEvents, WORKING_START_MIN, WORKING_END_MIN, formatTime, parseTime } from '../services/scheduleService';
import './Timetable.css';

export interface TimetableColumnGroup {
  id: string;
  title: string;
  devIds: string[];
  onHeaderClick?: () => void;
  backgroundColor?: string;
}

interface TimetableProps {
  date: string;
  tasks: Task[];
  settings: Settings;
  selectedTaskId?: string | null;
  onSlotClick?: (startTime: string) => void;
  onEventClick?: (taskId: string) => void;
  onHeaderClick?: (devId: string) => void;
  columnGroups?: TimetableColumnGroup[]; // Optional grouping for confirmed view
}

const Timetable: React.FC<TimetableProps> = ({ date, tasks, settings, selectedTaskId, onSlotClick, onEventClick, onHeaderClick, columnGroups }) => {
  const totalMinutes = WORKING_END_MIN - WORKING_START_MIN;
  const [hoverY, setHoverY] = React.useState<number | null>(null);
  const [hoverTime, setHoverTime] = React.useState<string | null>(null);
  const [tooltip, setTooltip] = React.useState<{ x: number, y: number, content: React.ReactNode } | null>(null);
  
  // Determine columns to render
  let columns: { devId: string, groupId?: string }[] = [];
  
  // Helper to get devs by role (used in both branches)
  const pmDevs = settings.devs.filter(d => d.roleId === 'role-pm');
  const designerRole = settings.roles.find(r => r.name.toLowerCase() === 'designer' || r.name === 'デザイナー');
  const designerDevs = designerRole 
    ? settings.devs.filter(d => d.roleId === designerRole.id)
    : [];
  const otherDevs = settings.devs.filter(d => !pmDevs.includes(d) && !designerDevs.includes(d));

  if (columnGroups) {
    // Render based on groups
    columnGroups.forEach(group => {
      group.devIds.forEach(devId => {
        columns.push({ devId, groupId: group.id });
      });
    });
  } else {
    // Default rendering (PM -> Designer -> Devs)
    [...pmDevs, ...designerDevs, ...otherDevs].forEach(dev => {
      columns.push({ devId: dev.id });
    });
  }

  const allDevs = columns.map(c => settings.devs.find(d => d.id === c.devId)).filter(Boolean) as typeof settings.devs;

  // Determine highlighted devs based on selected task
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
  const confirmedDevIds = new Set<string>();
  const candidateDevIds = new Set<string>();

  if (selectedTask) {
    // PM
    if (selectedTask.roles.pmId) confirmedDevIds.add(selectedTask.roles.pmId);
    
    // Designers
    selectedTask.roles.designerIds?.forEach(id => confirmedDevIds.add(id));
    
    // Devs
    if (selectedTask.roles.devPlan.mode === 'AllDev') {
      // All devs
      otherDevs.forEach(d => confirmedDevIds.add(d.id));
    } else if (selectedTask.roles.devPlan.mode === 'Tracks') {
      // Assigned tracks
      const assignedTrackIds = selectedTask.roles.devPlan.assignedTrackIds || [];
      const requiredCount = selectedTask.roles.devPlan.requiredTrackCount || 0;
      
      // If assignment is complete, only highlight assigned track members
      if (assignedTrackIds.length >= requiredCount && requiredCount > 0) {
        const assignment = settings.dailyTrackAssignments[date] || {};
        assignedTrackIds.forEach(trackId => {
          const devIds = assignment[trackId] || [];
          devIds.forEach(id => confirmedDevIds.add(id));
        });
      } else {
        // If incomplete, highlight ALL devs (draft state)
        otherDevs.forEach(d => confirmedDevIds.add(d.id));
      }
    }
  }

  // Generate time labels (every hour)
  const timeLabels: string[] = [];
  for (let m = WORKING_START_MIN; m <= WORKING_END_MIN; m += 60) {
    timeLabels.push(formatTime(m));
  }

  // Calculate global busy ranges
  const allEvents = allDevs.flatMap(dev => getDevEvents(date, dev.id, tasks, settings));
  
  const sortedRanges = allEvents
    .map(e => ({ start: e.start, end: e.end }))
    .sort((a, b) => a.start - b.start);

  const busyRanges: { start: number, end: number }[] = [];
  
  if (sortedRanges.length > 0) {
    let current = sortedRanges[0];
    for (let i = 1; i < sortedRanges.length; i++) {
      const next = sortedRanges[i];
      if (next.start < current.end) {
        current.end = Math.max(current.end, next.end);
      } else {
        busyRanges.push(current);
        current = next;
      }
    }
    busyRanges.push(current);
  }

  // Calculate break time range
  const breakStart = settings.breakTime ? parseTime(settings.breakTime.startTime) : parseTime('12:30');
  const breakDuration = settings.breakTime ? settings.breakTime.duration : 60;
  const breakEnd = breakStart + breakDuration;
  const breakTop = Math.max(0, breakStart - WORKING_START_MIN);
  const breakHeight = Math.min(breakDuration, totalMinutes - breakTop);

  const hoverStatus = React.useMemo((): 'valid' | 'invalid' | 'warning' => {
    if (!selectedTask || hoverY === null || !hoverTime) return 'valid';

    const startMins = hoverY + WORKING_START_MIN;
    const duration = selectedTask.time?.duration || 30;
    const endMins = startMins + duration;

    // Check confirmed participants
    for (const devId of confirmedDevIds) {
      const events = getDevEvents(date, devId, tasks, settings);
      
      // Check for overlap with any event that is NOT the current task
      const hasConflict = events.some(event => {
        if (event.id === selectedTask.id) return false; // Ignore self
        
        // Check overlap
        return event.start < endMins && event.end > startMins;
      });

      if (hasConflict) return 'invalid';
    }

    // Check break time overlap
    if (startMins < breakEnd && endMins > breakStart) {
      return 'warning';
    }

    return 'valid';
  }, [selectedTask, hoverY, hoverTime, confirmedDevIds, tasks, settings, date, breakStart, breakEnd]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedTaskId) {
      setHoverY(null);
      return;
    }

    // Check if locked
    if (selectedTask && (selectedTask.constraints?.timeLocked || selectedTask.externalParticipants?.some(p => p.timeFixed))) {
      setHoverY(null);
      return;
    }
    
    // Calculate Y relative to the timetable body
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    // Snap to 5 mins (5px)
    const snappedY = Math.floor(y / 5) * 5;
    const minutes = snappedY + WORKING_START_MIN;
    
    if (minutes >= WORKING_START_MIN && minutes <= WORKING_END_MIN) {
      setHoverY(snappedY);
      setHoverTime(formatTime(minutes));
    }
  };

  const handleMouseLeave = () => {
    setHoverY(null);
    setHoverTime(null);
  };

  const handleBodyClick = () => {
    if (selectedTaskId && onSlotClick && hoverTime && selectedTask) {
      // Check if locked
      if (selectedTask.constraints?.timeLocked || selectedTask.externalParticipants?.some(p => p.timeFixed)) {
        return;
      }

      // Check for conflicts with confirmed participants
      const [h, m] = hoverTime.split(':').map(Number);
      const startMins = h * 60 + m;
      const duration = selectedTask.time?.duration || 30; // Default to 30 if not set
      const endMins = startMins + duration;

      let hasConflict = false;
      for (const devId of confirmedDevIds) {
        const devEvents = getDevEvents(date, devId, tasks, settings);
        // Check overlap
        for (const event of devEvents) {
          // Skip the task itself if it's already scheduled (though usually we are moving it)
          if (event.id === selectedTaskId) continue;

          if (startMins < event.end && endMins > event.start) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) break;
      }

      if (hasConflict) {
        // alert('確定参加者の予定と重複しているため設定できません。');
        return;
      }

      onSlotClick(hoverTime);
    }
  };

  return (
    <div className="timetable-container">
      <div className="timetable-header-wrapper">
        {/* Group Header Row (Optional) */}
        {columnGroups && (
          <div className="timetable-group-header">
            <div className="time-column-header"></div>
            <div className="summary-column-header"></div>
            {columnGroups.map(group => (
              <div 
                key={group.id} 
                className="group-header-cell"
                style={{ 
                  width: `${group.devIds.length * 70}px`,
                  flex: 'none',
                  backgroundColor: group.backgroundColor
                }}
                onClick={group.onHeaderClick}
              >
                {group.title}
              </div>
            ))}
          </div>
        )}
        
        {/* Dev Header Row */}
        <div className="timetable-header">
          <div className="time-column-header"></div>
          <div className="summary-column-header"></div>
          {columns.map((col, index) => {
            const dev = settings.devs.find(d => d.id === col.devId);
            if (!dev) return null;

            let headerClass = "dev-column-header";
            if (confirmedDevIds.has(dev.id)) headerClass += " header-highlight-confirmed";
            else if (candidateDevIds.has(dev.id)) headerClass += " header-highlight-candidate";

            return (
              <div 
                key={`${dev.id}-${index}`} 
                className={headerClass}
                onClick={() => onHeaderClick && onHeaderClick(dev.id)}
                style={{ cursor: onHeaderClick ? 'pointer' : 'default' }}
              >
                <div className="dev-name">{dev.name}</div>
                <div className="dev-role">{settings.roles.find(r => r.id === dev.roleId)?.name || 'Dev'}</div>
              </div>
            );
          })}
        </div>
      </div>
      
      <div 
        className="timetable-body"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleBodyClick}
        style={{ cursor: selectedTaskId ? 'pointer' : 'default' }}
      >
        {/* Hover Guide */}
        {selectedTaskId && hoverY !== null && selectedTask && (
          <div 
            className={`hover-guide ${hoverStatus}`}
            style={{ 
              top: `${hoverY}px`,
              height: `${selectedTask.time?.duration || 30}px`
            }}
          >
            <div className="hover-time-label">{hoverTime}</div>
          </div>
        )}

        {/* Break Time Background Layer */}
        <div 
          className="break-time-layer"
          style={{
            top: `${breakTop}px`,
            height: `${breakHeight}px`
          }}
        />

        {/* Time Labels Column */}
        <div className="time-column">
          {timeLabels.map(label => (
            <div key={label} className="time-label" style={{ height: '60px' }}>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Summary Column */}
        <div className="summary-column">
          {/* Grid lines */}
          {timeLabels.map((_, i) => (
            <div key={i} className="grid-cell" style={{ height: '60px' }}></div>
          ))}
          
          {/* Busy Blocks */}
          {busyRanges.map((range, i) => {
            const startOffset = Math.max(0, range.start - WORKING_START_MIN);
            const duration = Math.min(range.end - range.start, totalMinutes - startOffset);
            
            return (
              <div
                key={i}
                className="summary-block"
                style={{
                  top: `${startOffset}px`,
                  height: `${duration}px`
                }}
              />
            );
          })}
        </div>

        {/* Dev Columns */}
        {allDevs.map(dev => {
          const events = getDevEvents(date, dev.id, tasks, settings);
          
          return (
            <div key={dev.id} className="dev-column">
              {/* Grid lines */}
              {timeLabels.map((_, i) => (
                <div key={i} className="grid-cell" style={{ height: '60px' }}></div>
              ))}

              {/* Events */}
              {events.map(event => {
                // Calculate position
                const startOffset = Math.max(0, event.start - WORKING_START_MIN);
                const duration = Math.min(event.end - event.start, totalMinutes - startOffset);
                
                // 1 min = 1px (since 60px height for 60 mins)
                const top = startOffset; 
                const height = duration;

                return (
                  <div
                    key={event.id}
                    className={`event-block type-${event.type} ${event.id === selectedTaskId ? 'selected-event' : ''}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      backgroundColor: event.color
                    }}
                    title={!selectedTaskId ? '' : `${event.title} (${formatTime(event.start)} - ${formatTime(event.end)})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (event.type === 'task' && onEventClick) {
                        onEventClick(event.id);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTaskId) return;

                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = rect.right + 10;
                      const y = rect.top;

                      if (event.type === 'task') {
                        const task = tasks.find(t => t.id === event.id);
                        if (task) {
                          setTooltip({
                            x,
                            y,
                            content: (
                              <div className="task-tooltip-content">
                                <div className="tooltip-title">{task.title}</div>
                                <div className="tooltip-summary">{task.summary}</div>
                                <div className="tooltip-time">
                                  {formatTime(event.start)} - {formatTime(event.end)}
                                </div>
                                <div className="tooltip-status">
                                  ステータス: {{
                                    'Draft': '下書き',
                                    'Planned': '計画済',
                                    'Scheduled': '確定済',
                                    'Done': '完了',
                                    'Canceled': '中止'
                                  }[task.status] || task.status}
                                </div>
                              </div>
                            )
                          });
                        }
                      } else if (event.type === 'personal' || event.type === 'off') {
                        setTooltip({
                          x,
                          y,
                          content: (
                            <div className="task-tooltip-content">
                              <div className="tooltip-title">{event.devName}</div>
                              {event.description && (
                                <div className="tooltip-summary">{event.description}</div>
                              )}
                              <div className="tooltip-time">
                                {formatTime(event.start)} - {formatTime(event.end)}
                              </div>
                            </div>
                          )
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div className="event-title">{event.title}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      
      {tooltip && !selectedTaskId && (
        <div 
          className="task-tooltip"
          style={{ 
            position: 'fixed', 
            left: tooltip.x, 
            top: tooltip.y,
            zIndex: 1000 
          }}
        >
          {tooltip.content}
        </div>
      )}

      {selectedTaskId && hoverTime && (
        <div className="timetable-status-bar">
          開始時間: {hoverTime}
        </div>
      )}
    </div>
  );
};

export default Timetable;
