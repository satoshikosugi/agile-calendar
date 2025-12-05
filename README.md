# Agile Calendar - Miro Standup Scheduler

A Miro Web SDK application designed to streamline agile team standup meetings by managing tasks, team members, tracks, and schedules directly on a Miro board.

## Overview

This application helps agile development teams manage their daily standup operations efficiently by:

- Managing tasks with PM, Designer, and Dev participation modes
- Creating and maintaining 3-month rolling calendar views
- Organizing developers into tracks (pair programming units)
- Supporting two-phase standup meetings (Phase1: full team, Phase2: devs only)
- Tracking personal schedules and availability
- Coordinating with external teams

## Features

### Current Implementation

#### ✅ Tasks Tab
- Create, edit, and delete tasks
- Set task status (Draft, Planned, Scheduled, Done, Canceled)
- Configure dates and time ranges
- Define Dev participation modes (No Dev, Tracks, All Dev)
- Add external links to tasks
- Specify required track counts for tasks

#### ✅ Calendar Tab
- Generate 3-month calendar views on the Miro board
- Navigate between months (previous/next)
- Automatically create calendar frames with PM, Designer, and Track rows
- Display tasks in appropriate calendar cells

#### ✅ Tracks & Devs Tab
- Manage developer roster
- Create and manage tracks (up to 2 developers per track for pair programming)
- Activate/deactivate tracks
- View track capacity and status

#### ✅ Settings Tab
- Configure base month for calendar display
- Manage external team definitions
- View current statistics (devs, tracks, external teams)

### Planned Features (Not Yet Implemented)

- **Phase1 Standup Tab**: Full team planning with PM, Designers, and Dev mode decisions
- **Phase2 Standup Tab**: Dev-only session for track assignments and conflict resolution
- **Daily Track Assignments**: Assign specific developers to tracks for each day
- **Personal Schedules**: Track full-day off and partial time blocks
- **Conflict Detection**: Identify scheduling conflicts based on availability
- **Task Placement**: Automatically position tasks on the calendar based on date/time

## Tech Stack

- **TypeScript** - Type-safe development
- **React** - UI framework
- **Vite** - Build tool and dev server
- **Miro Web SDK v2** - Integration with Miro boards

## Project Structure

```
src/
├── components/
│   └── Tabs/
│       ├── TasksTab.tsx          # Task management UI
│       ├── CalendarTab.tsx       # Calendar generation and navigation
│       ├── TracksTab.tsx         # Developer and track management
│       └── SettingsTab.tsx       # Application settings
├── models/
│   └── types.ts                  # TypeScript type definitions
├── services/
│   ├── settingsService.ts        # Settings persistence
│   ├── tasksService.ts           # Task CRUD operations
│   └── calendarLayoutService.ts  # Calendar rendering logic
├── App.tsx                       # Main application component
├── miro.ts                       # Miro SDK initialization
└── index.tsx                     # Application entry point
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Miro account and board

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/satoshikosugi/agile-calender.git
   cd agile-calender
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

### Miro App Setup

To use this app with Miro, you'll need to:

1. Create a new Miro app in the [Miro Developer Portal](https://developers.miro.com/)
2. Configure the app with Web SDK permissions
3. Set up the app URL to point to your hosted application
4. Install the app to your Miro board

Detailed Miro setup instructions will be added in a future update.

## Data Model

All data is stored directly on the Miro board using metadata:

- **Settings**: Stored in an invisible shape's metadata
- **Tasks**: Each task is a sticky note with metadata
- **Calendar Frames**: Month views are Miro frames with labeled rows and columns

See `develop.md` for detailed data model specifications.

## Usage

1. **Set up your team**: 
   - Go to the Tracks & Devs tab
   - Add developers to your team
   - Create tracks (typically Track1, Track2, etc.)

2. **Configure settings**:
   - Go to the Settings tab
   - Set your base month
   - Add external teams if needed

3. **Create tasks**:
   - Go to the Tasks tab
   - Click "New Task" to create tasks
   - Fill in details including dates, times, and Dev mode

4. **Generate calendar**:
   - Go to the Calendar tab
   - Click "Generate/Update Calendar" to create the calendar frames on your Miro board
   - Use navigation buttons to move between months

## Development Roadmap

See the full specification in `develop.md` for complete details. Key remaining features:

- [ ] Phase1 Standup Tab implementation
- [ ] Phase2 Standup Tab implementation  
- [ ] Daily track assignment UI
- [ ] Personal schedule management
- [ ] Conflict detection and resolution
- [ ] Enhanced task placement on calendar
- [ ] Rotation algorithms for track assignments
- [ ] Integration with external task management tools (future)

## Contributing

Contributions are welcome! Please see our contributing guidelines for more information.

## License

ISC

## See Also

- [develop.md](develop.md) - Complete technical specification
- [Miro Web SDK Documentation](https://developers.miro.com/docs/web-sdk-reference)
