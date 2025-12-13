<!-- ff59dc54-8bc0-43cc-a90e-1c78bbb33123 786a5d44-be24-44ed-9073-827aedf1dea9 -->
# Add Due Date Support

## Overview

Due dates already exist in the data model and schema. This plan adds:

1. Reusable date-time picker component for tasks
2. Visual indicators for due dates
3. Enhanced task prioritization based on due dates

## Implementation Steps

### 1. Create DateTimePicker Component

Create [`src/lib/components/DateTimePicker.svelte`](src/lib/components/DateTimePicker.svelte):

**Props**:

- `value?: Date` - (bindable)
- `onchange: (timestamp?: number) => void` - Callback when date changes
- `includeTime?: boolean` - Whether to show time picker (default: true)

**UI Structure**:

- ResponsiveDialog wrapping calendar
- Trigger button (CalendarIcon + formatted date text)
- Calendar with preset buttons (Today, Tomorrow, +3d, +7d, +14d)
- Optional time picker
- "Clear" button to remove due date

**Internal**: Uses CalendarDate for calendar component, but API is plain timestamps

### 2. Integrate into TaskEditor

Update [`src/routes/(authenticated)/projects/[projectId]/TaskEditor.svelte`](src/routes/(authenticated)/projects/[projectId]/TaskEditor.svelte):

Add in body below content:

```svelte
<DateTimePicker
  value={task.data.dueDate}
  onchange={(timestamp) => {
    task.data.dueDate = timestamp;
    tasksAPI.updateTask({ id: task.id, dueDate: timestamp });
  }}
/>
```

### 3. Add Visual Indicators

Create utility in [`src/lib/utils.ts`](src/lib/utils.ts):

```typescript
export function getDueDateStatus(dueDate?: number): {
  status: 'overdue' | 'due-today' | 'due-soon' | 'upcoming' | 'none';
  text: string;
  className: string;
}
```

Add badges to:

- Task list items (TaskList.svelte)
- Task editor header
- TaskNode
- Planner suggestion items (SuggestionListItem.svelte)

Format: Relative time ("overdue by 2 days", "due in 3 hours", "due today")

### 4. Update Task Prioritization

Modify [`src/convex/tasks.ts`](src/convex/tasks.ts) `getPrioritizedTasks` query (line 1006-1068).

Replace sorter at line 1033:

```typescript
const sorter = (a?: DBNode, b?: DBNode) => {
  if (!a) return -1;
  if (!b) return 1;
  
  const aDue = a.data.type === 'task' ? a.data.dueDate : undefined;
  const bDue = b.data.type === 'task' ? b.data.dueDate : undefined;
  
  // Sort by due date (soonest first, including overdue)
  if (aDue && bDue) return aDue - bDue;
  if (aDue && !bDue) return -1;
  if (!aDue && bDue) return 1;
  
  // Maintain tree order for tasks without due dates
  return 0;
};
```

This naturally prioritizes overdue tasks first since they have smaller timestamps.

## Files Changed

1. **New**: `src/lib/components/DateTimePicker.svelte`
2. **Modified**: `src/routes/(authenticated)/projects/[projectId]/TaskEditor.svelte`
3. **Modified**: `src/convex/tasks.ts` (getPrioritizedTasks sorter)
4. **Modified**: `src/lib/utils.ts` (add getDueDateStatus)
5. **Modified**: Task list components for visual indicators

### To-dos

- [ ] Create reusable DateTimePicker component with calendar + responsive dialog
- [ ] Add DateTimePicker to TaskEditor header
- [ ] Add DateTimePicker to ProjectEditor header
- [ ] Create getDueDateStatus utility for visual indicators
- [ ] Add due date badges to task lists and editors
- [ ] Update getPrioritizedTasks sorter to boost due/overdue tasks
- [ ] Create reusable DateTimePicker component with calendar + responsive dialog
- [ ] Add DateTimePicker to TaskEditor header
- [ ] Add DateTimePicker to ProjectEditor header
- [ ] Create getDueDateStatus utility for visual indicators
- [ ] Add due date badges to task lists and editors
- [ ] Update getPrioritizedTasks sorter to boost due/overdue tasks