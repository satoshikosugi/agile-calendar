// Data models based on the specification in develop.md

export type TaskStatus = 'Draft' | 'Planned' | 'Scheduled' | 'Done' | 'Canceled';
export type DevPlanPhase = 'Draft' | 'Phase1Planned' | 'Phase2Fixed';
export type DevMode = 'NoDev' | 'Tracks' | 'AllDev';
export type PersonalScheduleType = 'fullDayOff' | 'partial';

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

export interface PersonalSchedule {
  date: string; // YYYY-MM-DD
  type: PersonalScheduleType;
  reason: string;
  start?: string; // HH:MM for partial
  end?: string; // HH:MM for partial
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
  personalSchedules: {
    [devId: string]: PersonalSchedule[];
  };
  dailyTrackAssignments: {
    [date: string]: DailyTrackAssignment;
  };
  breakTime?: {
    startTime: string; // HH:MM
    duration: number; // minutes
  };
}
