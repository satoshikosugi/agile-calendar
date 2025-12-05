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
    start: string; // HH:MM
    end: string; // HH:MM
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

export interface Dev {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  role: string;
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
  devs: Dev[];
  tracks: Track[];
  externalTeams: ExternalTeam[];
  personalSchedules: {
    [devId: string]: PersonalSchedule[];
  };
  dailyTrackAssignments: {
    [date: string]: DailyTrackAssignment;
  };
}
