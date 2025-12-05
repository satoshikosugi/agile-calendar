# Remaining Tasks for Agile Calendar Development

This document outlines the remaining tasks that need to be implemented according to the specifications in develop.md. These should be created as GitHub issues.

## Issue 1: Implement Phase1 Standup Tab (Full Team Planning)

**Priority**: High
**Estimated Effort**: Large

### Description
Implement the Phase1 Standup Tab for full team planning sessions involving PM, Designers, and the entire development team.

### Requirements
- Display tasks filtered by time period (today, this week, etc.)
- Show task list in table format with columns: Title, Date/Time, Roles (PM/Designer/Dev), External Teams, Constraints
- Implement inline editing for key fields:
  - Dev mode selection (NoDev, Tracks, AllDev)
  - Required track count (when mode is Tracks)
  - Date and time range editing
- Add calendar synchronization to show available time slots
- Implement capacity checking:
  - Calculate total track capacity vs required tracks
  - Display warnings for over-capacity time slots
- Respect time-locked tasks (disable editing for locked tasks)
- Update task devPlan.phase to "Phase1Planned" when complete

### Acceptance Criteria
- [ ] Can view and filter tasks by date range
- [ ] Can edit Dev mode and track requirements inline
- [ ] Can adjust task times with visual feedback
- [ ] Capacity warnings display when conflicts detected
- [ ] Time-locked tasks cannot be modified
- [ ] Changes persist to Miro board

---

## Issue 2: Implement Phase2 Standup Tab (Dev Track Assignment)

**Priority**: High
**Estimated Effort**: Large

### Description
Implement the Phase2 Standup Tab for dev-only sessions where specific tracks are assigned to tasks and conflicts are resolved.

### Requirements
- Display only tasks with devPlan.phase == "Phase1Planned"
- Show tasks ordered by time
- For tasks with mode "Tracks":
  - Display available tracks for assignment
  - Check personal schedules to determine track availability
  - Show visual indicators (✅ available, ⚠️ partial availability, ❌ unavailable)
  - Allow selection of specific tracks
- For tasks with mode "AllDev":
  - Check all dev personal schedules for conflicts
  - Display warnings if any conflicts exist
- Allow time adjustments for non-locked tasks
- Update task devPlan.phase to "Phase2Fixed" when tracks assigned
- Store assigned track IDs in task.roles.devPlan.assignedTrackIds

### Acceptance Criteria
- [ ] Shows only Phase1Planned tasks
- [ ] Can assign specific tracks to tasks
- [ ] Personal schedule conflicts are detected and displayed
- [ ] Visual indicators show track availability status
- [ ] Can adjust task times to resolve conflicts
- [ ] Updates persist with Phase2Fixed status
- [ ] Assigned tracks are saved correctly

---

## Issue 3: Implement Daily Track Assignment Management

**Priority**: High
**Estimated Effort**: Medium

### Description
Add functionality to manage daily track assignments (which devs are in which tracks on specific dates).

### Requirements
- Add UI within Tracks & Devs tab for daily assignments
- Date selector (default to today)
- Grid showing all active tracks
- Drag-and-drop or selection interface to assign devs to tracks
- Validation:
  - Each track has at most capacity devs (typically 2)
  - Each dev assigned to only one track per day
- Quick actions:
  - "Auto Assign" button - automatically distribute devs across tracks
  - "Copy from Yesterday" button
  - "Apply Rotation" button (simple rotation algorithm)
- Store in settings.dailyTrackAssignments[date]

### Acceptance Criteria
- [ ] Can select any date for editing
- [ ] Can assign devs to tracks visually
- [ ] Validation prevents invalid assignments
- [ ] Auto-assign distributes devs evenly
- [ ] Can copy previous day's assignments
- [ ] Changes persist to Miro board
- [ ] Integrates with Phase2 availability checking

---

## Issue 4: Implement Personal Schedule Management

**Priority**: Medium
**Estimated Effort**: Medium

### Description
Add UI for managing personal schedules (full-day off, partial time blocks).

### Requirements
- Add "Personal Schedules" section in Tracks & Devs tab
- For each dev, allow adding schedule entries:
  - Date picker
  - Type selection (fullDayOff or partial)
  - For partial: start time and end time inputs
  - Reason/description field
- List view of all scheduled absences/blocks
- Edit and delete functionality
- Store in settings.personalSchedules[devId]

### Acceptance Criteria
- [ ] Can add full-day off for any dev
- [ ] Can add partial time blocks with start/end times
- [ ] Can view all personal schedules
- [ ] Can edit and delete schedule entries
- [ ] Changes persist to Miro board
- [ ] Integrates with Phase2 conflict detection

---

## Issue 5: Enhanced Calendar Task Placement

**Priority**: Medium
**Estimated Effort**: Medium

### Description
Improve the calendar rendering to automatically place tasks in the correct cells based on their date, time, and assigned tracks.

### Requirements
- When tasks are created/updated with date and time:
  - Calculate the appropriate position on the calendar
  - Place task sticky note in correct date column
  - Place in correct row (PM, Designer, or Track row)
- Update positions when tasks are reassigned
- Handle tasks spanning multiple days/times
- Visual indicators for:
  - Task status (color coding)
  - External team participation
  - Time-locked tasks (lock icon)

### Acceptance Criteria
- [ ] Tasks appear in correct calendar cells
- [ ] Position updates when task date/time changes
- [ ] Tasks appear in assigned track rows
- [ ] Visual styling reflects task properties
- [ ] Works across all calendar months

---

## Issue 6: Implement Conflict Detection and Resolution

**Priority**: Medium
**Estimated Effort**: Medium

### Description
Add comprehensive conflict detection for scheduling conflicts between tasks, personal schedules, and resource availability.

### Requirements
- Detect conflicts in real-time:
  - Multiple tasks requiring the same track at same time
  - Tasks scheduled when track members have personal blocks
  - Over-capacity situations (more required tracks than available)
- Visual conflict indicators:
  - Warning icons on tasks
  - Color highlighting on calendar
  - Detailed conflict descriptions in tooltips
- Suggest resolution options:
  - Alternative time slots
  - Alternative track assignments
- Allow marking conflicts as "accepted" if unavoidable

### Acceptance Criteria
- [ ] All conflict types are detected
- [ ] Conflicts display clearly in UI
- [ ] Can see detailed conflict information
- [ ] Suggestions provided when available
- [ ] Can accept/acknowledge conflicts
- [ ] Detection runs in real-time during editing

---

## Issue 7: Add External Participant Management to Tasks

**Priority**: Low
**Estimated Effort**: Small

### Description
Enhance the Tasks tab to fully support external participant configuration.

### Requirements
- In task edit form, add section for external participants
- Allow selecting from settings.externalTeams
- For each selected team:
  - Checkbox for "required" participation
  - Checkbox for "time fixed" (team sets the time)
- Display external team info in task detail view
- Show external team participation in Phase1 planning

### Acceptance Criteria
- [ ] Can add/remove external teams from tasks
- [ ] Can mark teams as required
- [ ] Can mark time as fixed by external team
- [ ] External participation displays in views
- [ ] Time-fixed flag prevents time changes

---

## Issue 8: Add PM and Designer Assignment to Tasks

**Priority**: Low
**Estimated Effort**: Small

### Description
Add UI for assigning PM and Designer roles to tasks.

### Requirements
- Add PM master data to settings (similar to devs)
- Add Designer master data to settings
- In task edit form:
  - Dropdown to select PM (from settings.pms)
  - Multi-select for Designers (from settings.designers)
- Store in task.roles.pmId and task.roles.designerIds
- Display in task views and Phase1 planning

### Acceptance Criteria
- [ ] Can add/edit PM and Designer lists in settings
- [ ] Can assign PM to tasks
- [ ] Can assign multiple Designers to tasks
- [ ] Assignments display in all relevant views
- [ ] Changes persist to Miro board

---

## Issue 9: Implement Data Export/Import

**Priority**: Low
**Estimated Effort**: Small

### Description
Add functionality to export and import settings and tasks as JSON files.

### Requirements
- Add "Export" button in Settings tab
  - Exports all settings and tasks as JSON
  - Downloads file to user's computer
- Add "Import" button in Settings tab
  - Allows uploading JSON file
  - Validates structure
  - Confirms before overwriting existing data
  - Imports and saves to Miro board

### Acceptance Criteria
- [ ] Can export complete data as JSON
- [ ] Can import JSON to restore data
- [ ] Import validates data structure
- [ ] Confirmation required before import
- [ ] Works across different boards

---

## Issue 10: Add Automated Tests

**Priority**: Low
**Estimated Effort**: Large

### Description
Add comprehensive test coverage for the application.

### Requirements
- Set up testing framework (Vitest recommended)
- Unit tests for:
  - Data models and type validation
  - Service functions (settings, tasks, calendar)
  - Utility functions
- Component tests for:
  - Each tab component
  - Form validation
  - User interactions
- Integration tests for:
  - Settings persistence
  - Task CRUD operations
  - Calendar generation

### Acceptance Criteria
- [ ] Testing framework configured
- [ ] Core services have unit tests
- [ ] Components have basic test coverage
- [ ] Tests run in CI/CD pipeline
- [ ] Coverage report available

---

## Issue 11: Improve Error Handling and User Feedback

**Priority**: Medium
**Estimated Effort**: Small

### Description
Enhance error handling throughout the application and provide better user feedback.

### Requirements
- Replace `alert()` calls with toast notifications or modal dialogs
- Add loading states for all async operations
- Improve error messages to be more user-friendly
- Add retry mechanisms for failed operations
- Log errors for debugging while showing friendly messages to users
- Add confirmation dialogs for destructive actions

### Acceptance Criteria
- [ ] No raw alert() calls remain
- [ ] Loading indicators on all async operations
- [ ] Clear error messages for users
- [ ] Errors logged to console for debugging
- [ ] Confirmations for deletes and overwrites

---

## Issue 12: Miro App Configuration Documentation

**Priority**: High
**Estimated Effort**: Small

### Description
Create comprehensive documentation for setting up the app in Miro.

### Requirements
- Step-by-step guide for:
  - Creating Miro app in developer portal
  - Configuring app permissions
  - Setting up app URLs
  - Installing app to boards
  - Troubleshooting common issues
- Add screenshots and examples
- Include app manifest/configuration details
- Document required Miro SDK permissions

### Acceptance Criteria
- [ ] Complete setup guide written
- [ ] Screenshots added for key steps
- [ ] App permissions documented
- [ ] Common issues and solutions listed
- [ ] Example configuration provided

---

## Implementation Priority Order

Based on the develop.md specification priorities:

1. **High Priority (MVP)**
   - Issue 1: Phase1 Standup Tab
   - Issue 2: Phase2 Standup Tab  
   - Issue 3: Daily Track Assignments
   - Issue 12: Miro Setup Documentation

2. **Medium Priority (Core Enhancements)**
   - Issue 4: Personal Schedule Management
   - Issue 5: Enhanced Calendar Placement
   - Issue 6: Conflict Detection
   - Issue 11: Error Handling Improvements

3. **Low Priority (Polish & Extras)**
   - Issue 7: External Participant Management
   - Issue 8: PM/Designer Assignment
   - Issue 9: Data Export/Import
   - Issue 10: Automated Tests

## Notes for Creating GitHub Issues

When creating these issues:
- Use appropriate labels (enhancement, documentation, testing, etc.)
- Assign priority labels (high, medium, low)
- Reference develop.md for detailed specifications
- Link related issues together
- Add "good first issue" label for simpler tasks (Issues 7, 8, 9, 12)
- Consider breaking down large issues (1, 2, 10) into smaller sub-tasks
