import { Settings, Task } from '../models/types';

export const WORKING_START_HOUR = 9;
export const WORKING_END_HOUR = 18;
export const WORKING_START_MIN = WORKING_START_HOUR * 60;
export const WORKING_END_MIN = WORKING_END_HOUR * 60;

export const parseTime = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

interface TimeRange {
  start: number;
  end: number;
}

export const getCommonFreeSlots = (
  date: string,
  userIds: string[],
  duration: number,
  settings: Settings
): string[] => {
  // 1. Initialize available time as the full working day
  let availableRanges: TimeRange[] = [{ start: WORKING_START_MIN, end: WORKING_END_MIN }];

  // 2. Collect all busy ranges for selected users
  const busyRanges: TimeRange[] = [];

  userIds.forEach(userId => {
    const schedules = settings.personalSchedules[userId] || [];
    const daySchedules = schedules.filter(s => s.date === date);

    daySchedules.forEach(s => {
      if (s.type === 'fullDayOff') {
        busyRanges.push({ start: WORKING_START_MIN, end: WORKING_END_MIN });
      } else if (s.type === 'partial' && s.start && s.end) {
        busyRanges.push({ start: parseTime(s.start), end: parseTime(s.end) });
      }
    });
  });

  // 3. Subtract busy ranges from available ranges
  // Sort busy ranges by start time
  busyRanges.sort((a, b) => a.start - b.start);

  for (const busy of busyRanges) {
    const newAvailable: TimeRange[] = [];
    for (const avail of availableRanges) {
      // Case 1: Busy range is completely outside available range (no overlap)
      if (busy.end <= avail.start || busy.start >= avail.end) {
        newAvailable.push(avail);
      }
      // Case 2: Busy range covers available range completely
      else if (busy.start <= avail.start && busy.end >= avail.end) {
        // Remove this available range (do nothing)
      }
      // Case 3: Busy range overlaps start of available range
      else if (busy.start <= avail.start && busy.end < avail.end) {
        newAvailable.push({ start: busy.end, end: avail.end });
      }
      // Case 4: Busy range overlaps end of available range
      else if (busy.start > avail.start && busy.end >= avail.end) {
        newAvailable.push({ start: avail.start, end: busy.start });
      }
      // Case 5: Busy range is inside available range (splits it)
      else if (busy.start > avail.start && busy.end < avail.end) {
        newAvailable.push({ start: avail.start, end: busy.start });
        newAvailable.push({ start: busy.end, end: avail.end });
      }
    }
    availableRanges = newAvailable;
  }

  // 4. Generate start times from available ranges that fit the duration
  const validStartTimes: string[] = [];
  
  availableRanges.forEach(range => {
    // Iterate from range.start to range.end - duration in 5 min steps
    for (let t = range.start; t <= range.end - duration; t += 5) {
      validStartTimes.push(formatTime(t));
    }
  });

  return validStartTimes;
};

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  type: 'task' | 'personal' | 'off';
  color?: string;
}

export const getDevEvents = (
  date: string,
  devId: string,
  tasks: Task[],
  settings: Settings
): CalendarEvent[] => {
  const events: CalendarEvent[] = [];

  // 1. Personal Schedules
  const schedules = settings.personalSchedules[devId] || [];
  const daySchedules = schedules.filter(s => s.date === date);

  daySchedules.forEach((s, index) => {
    if (s.type === 'fullDayOff') {
      events.push({
        id: `personal-${index}`,
        title: s.reason || '休暇',
        start: WORKING_START_MIN,
        end: WORKING_END_MIN,
        type: 'off',
        color: '#eeeeee'
      });
    } else if (s.type === 'partial' && s.start && s.end) {
      events.push({
        id: `personal-${index}`,
        title: s.reason || '私用',
        start: parseTime(s.start),
        end: parseTime(s.end),
        type: 'personal',
        color: '#fff3e0'
      });
    }
  });

  // 2. Tasks
  const dayTasks = tasks.filter(t => t.date === date && t.time?.startTime && t.time?.duration);

  dayTasks.forEach(task => {
    let isAssigned = false;

    // Check PM
    if (task.roles.pmId === devId) isAssigned = true;

    // Check Designer
    if (task.roles.designerIds?.includes(devId)) isAssigned = true;

    // Check Dev Plan
    if (!isAssigned) {
      if (task.roles.devPlan.mode === 'AllDev') {
        // Assuming AllDev includes this dev if they are a developer
        // Check if they are NOT PM and NOT Designer
        const dev = settings.devs.find(d => d.id === devId);
        const designerRole = settings.roles.find(r => r.name.toLowerCase() === 'designer' || r.name === 'デザイナー');
        const isDesigner = designerRole && dev?.roleId === designerRole.id;

        if (dev && dev.roleId !== 'role-pm' && !isDesigner) isAssigned = true;
      } else if (task.roles.devPlan.mode === 'Tracks') {
        const dev = settings.devs.find(d => d.id === devId);
        const designerRole = settings.roles.find(r => r.name.toLowerCase() === 'designer' || r.name === 'デザイナー');
        const isDesigner = designerRole && dev?.roleId === designerRole.id;
        const isDev = dev && dev.roleId !== 'role-pm' && !isDesigner;

        if (isDev) {
          const assignedTrackIds = task.roles.devPlan.assignedTrackIds || [];
          const requiredCount = task.roles.devPlan.requiredTrackCount || 0;
          
          // If assignment is complete (assigned tracks >= required), only show for assigned track members
          if (assignedTrackIds.length >= requiredCount && requiredCount > 0) {
            const assignment = settings.dailyTrackAssignments[date] || {};
            let isTrackMember = false;
            
            for (const trackId of assignedTrackIds) {
              const trackDevs = assignment[trackId] || [];
              if (trackDevs.includes(devId)) {
                isTrackMember = true;
                break;
              }
            }
            
            if (isTrackMember) isAssigned = true;
          } else {
            // If assignment is incomplete, show for ALL devs (draft state)
            isAssigned = true;
          }
        }
      }
    }

    if (isAssigned && task.time?.startTime && task.time?.duration) {
      const start = parseTime(task.time.startTime);
      const end = start + task.time.duration;
      
      // Determine color based on mode
      let color = '#e3f2fd'; // Default Blue (AllDev)
      if (task.roles.devPlan.mode === 'Tracks') {
        color = '#e8f5e9'; // Green (Tracks)
      }

      events.push({
        id: task.id,
        title: task.title,
        start,
        end,
        type: 'task',
        color
      });
    }
  });

  return events;
};
