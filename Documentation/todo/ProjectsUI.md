# Projects Page Redesign

## Overview

Transform the projects page into a psychology-informed project dashboard with configurable engagement features, proper information architecture, and user-friendly creation flow.

## Data Model Changes

### 1. Extend ProjectData Type

Update [`src/domain/models/project.ts`](src/domain/models/project.ts) to include:

- `showStreak?: boolean` - opt-in streak tracking
- `showVelocity?: boolean` - opt-in completion velocity  
- `showMomentumScore?: boolean` - opt-in momentum indicator
- `showNextAction?: boolean` - display first incomplete task
- `showMicroWins?: boolean` - weekly completions + celebration
```typescript
export interface ProjectData<T = Date> {
    type: "project";
    title: string;
    content?: string;
    status: ProjectStatus;
    dueDate?: T;
    
	uiPrefs: {
	    // Engagement feature flags
	    showStreak?: boolean;
	    showVelocity?: boolean;
	    showMomentumScore?: boolean;
	    showNextAction?: boolean;
	    showMicroWins?: boolean;   
	}
}
```


### 2. Update Convex Schema

Update [`src/convex/schema.ts`](src/convex/schema.ts) ProjectDataDef to include optional boolean fields for engagement features.

### 3. User Settings Schema

Add to [`src/lib/user-settings/schema.ts`](src/lib/user-settings/schema.ts):

- Default values for new projects: `defaultProjectShowStreak`, `defaultProjectShowVelocity`, etc.
- Default sort method for projects page

## Backend Implementation

### 4. Create Project Mutation

Add `createProject` mutation to [`src/convex/tasks.ts`](src/convex/tasks.ts):

- Accept title, content, status, dueDate, engagement flags
- Apply user's default engagement settings if not specified
- Return created project with ID

### 5. Project Metrics Calculation

Add helper functions to [`src/convex/tasks.ts`](src/convex/tasks.ts):

**Activity Detection** (for streaks/momentum):

- `getProjectActivity(projectId)` - returns meaningful edits (task completions, creations, significant changes) with timestamps
- Activity = task completion, task creation, or substantial content changes (not minor edits)

**Metrics Calculations**:

- `calculateStreak(activities)` - returns days active consecutively, or "last active X days ago"
- `calculateVelocity(activities)` - tasks completed per week over rolling 4-week window
- `calculateMomentumScore(activities)` - composite 0-100 score weighing recency, frequency, consistency
- `calculateProgress(projectId)` - total tasks, completed tasks, percentage
- `getNextAction(projectId)` - adapt existing `getPrioritizedTasks` logic for single project (first incomplete task, depth-first)
- `getMicroWins(projectId)` - count tasks completed in last 7 days
- `getSmartTimestamp(projectId)` - "2h ago - completed 2 tasks" format

### 6. Enhanced getProjects Query

Modify [`src/convex/tasks.ts`](src/convex/tasks.ts) `getProjects`:

- For each project, calculate and return metrics object
- Include: progress, momentum score, activity data
- Return with project data for sorting/filtering client-side

**Add TODO comments** in tasks.ts for future features:

```typescript
// TODO: Milestone support - allow users to mark tasks as milestones
// and show milestone progress (e.g., "2/5 milestones completed")

// TODO: Time estimate tracking - per-task time estimates that aggregate
// up to project level for "estimated time remaining" calculations
```

## Frontend Implementation

### 7. Project Card Component

Create [`src/routes/(authenticated)/projects/ProjectCard.svelte`](src/routes/\\(authenticated)/projects/ProjectCard.svelte):

- Display title, markdown content preview
- Always show: progress bar with percentage, smart timestamp
- Conditionally show (based on project settings): streak, velocity, momentum indicator, next action preview, micro wins with celebration
- **Remove ID from display** (security fix)
- Hover effects, click to navigate

### 8. Create Project Modal

Create [`src/routes/(authenticated)/projects/CreateProjectModal.svelte`](src/routes/\\(authenticated)/projects/CreateProjectModal.svelte):

- Form: title (required), content (optional markdown), due date (optional)
- Engagement feature checkboxes (pre-filled with user defaults)
- Save → calls createProject mutation

### 9. Projects Page Redesign

Update [`src/routes/(authenticated)/projects/+page.svelte`](src/routes/\\(authenticated)/projects/+page.svelte):

- **Floating action button** (bottom-right) to open create modal
- **Separate sections**: "Active Projects" and "Archived Projects" (collapsible)
- **Sorting controls**: dropdown for momentum (default), velocity, activity, title, due date, created date
- Grid layout with ProjectCard components
- Empty states for each section

### 10. API Layer Updates

Update [`src/lib/API/Tasks/ConvexTaskProvider.ts`](src/lib/API/Tasks/ConvexTaskProvider.ts):

- Add `createProject` method
- Ensure getProjects returns metrics

Update [`src/lib/API/Tasks/seam-interfaces.ts`](src/lib/API/Tasks/seam-interfaces.ts):

- Add createProject to interface

## Visual Design Notes

**Progress Bar**: thin, rounded, with percentage label

**Celebration Icons**: subtle ✨ or 🎉 for micro wins

**Streak Display**: "🔥 5 days active" or "Last worked on 3 days ago"

**Velocity**: "→ 3 tasks/week" with trend arrow

**Momentum**: Battery/flame icon 0-100% fill

**Next Action**: Subtle preview "Next: [task title]" truncated

**Smart Timestamp**: Bottom of card, muted color

## Implementation Order

1. DONE Data model changes (ProjectData, schema, user settings)
2. DONE ProjectCard component
3. DONE CreateProjectModal component
4. Projects page layout with sections and sorting
	layout = DONE
	sorting = PENDING...
5. -- Verify UI before implementing API logic --
6. Backend metrics calculations and createProject mutation
7. Enhanced getProjects with metrics
8. API layer updates