// Data models based on the specification in develop.md

export type TaskStatus = 'Draft' | 'Planned' | 'Done';
export type DevPlanPhase = 'Draft' | 'Phase1Planned' | 'Phase2Fixed';
export type DevMode = 'NoDev' | 'Tracks' | 'AllDev';
export type PersonalScheduleType = 'fullDayOff' | 'partial' | 'nonAgileTask' | 'personalErrand';

export interface Task {
  id: string;
  status: TaskStatus;
  title: string;
  summary: string;
  externalLink?: string;
  date?: string; // YYYY-MM-DD
  time?: {
    startTime?: string; // HH:MM (9:00-18:00)
    duration?: number; // minutes (5-480 in 5min increments)
  };
  roles: {
    pmId?: string;
    designerIds: string[];
    devPlan: {
      phase: DevPlanPhase;
      mode: DevMode;
      requiredTrackCount: number;
      assignedTrackIds: string[];
    };
  };
  externalParticipants: ExternalParticipant[];
  constraints: {
    timeLocked: boolean;
    rolesLocked: boolean;
    externalFixed: boolean;
  };
  recurringTaskId?: string;
}

export interface ExternalParticipant {
  teamId: string;
  required: boolean;
  timeFixed: boolean;
}

export interface Role {
  id: string;
  name: string;
  color?: string;
}

export interface Dev {
  id: string;
  name: string;
  roleId?: string; // Optional for backward compatibility, but should be set
}

export interface Track {
  id: string;
  name: string;
  role: string; // This could be linked to Role.id in future, currently string 'Dev' etc.
  capacity: number;
  active: boolean;
}

export interface ExternalTeam {
  id: string;
  name: string;
}

export interface ProjectHoliday {
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface PersonalSchedule {
  date: string; // YYYY-MM-DD
  type: PersonalScheduleType;
  reason: string;
  start?: string; // HH:MM for partial/others
  end?: string; // HH:MM for partial/others
}

export type RecurringFrequency = 'weekly' | 'monthly';

export interface RecurringRule {
  frequency: RecurringFrequency;
  // Weekly options
  weekDays?: number[]; // 0=Sun, 1=Mon, ... 6=Sat

  // Monthly options
  monthDayType?: 'startOfMonth' | 'endOfMonth' | 'specificDay';
  weekNumber?: number; // 1-5 (for Nth weekday)
  dayOfWeek?: number; // 0-6 (for Nth weekday)
  
  intervalMonths?: number; // Default 1
  
  validUntil?: string | null; // YYYY-MM-DD
}

export interface RecurringTask {
  id: string;
  template: Omit<Task, 'id' | 'date'>;
  rule: RecurringRule;
}

export interface DailyTrackAssignment {
  [trackId: string]: string[]; // Dev IDs
}

export interface Settings {
  baseMonth: string; // YYYY-MM
  viewSpanMonths: number;
  roles: Role[]; // Added roles management
  devs: Dev[];
  tracks: Track[];
  externalTeams: ExternalTeam[];
  projectHolidays: ProjectHoliday[];
  personalSchedules: {
    [devId: string]: PersonalSchedule[];
  };
  dailyTrackAssignments: {
    [date: string]: DailyTrackAssignment;
  };
  dailyAssignmentStatus?: {
    [date: string]: 'confirmed' | 'unconfirmed';
  };
  breakTime?: {
    startTime: string; // HH:MM
    duration: number; // minutes
  };
  recurringTasks: RecurringTask[];
}
