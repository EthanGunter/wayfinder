# Track 5: UI Components & Graph Logic Migration

## Overview
Update all UI components and graph logic to work with the new node structure. Since the API provider maintains backward compatibility, most components won't need changes. Focus on components that directly access task properties.

## Dependencies
- ✅ Track 1: Migration complete
- ✅ Track 2: Domain models defined
- ✅ Track 3: Backend updated
- ✅ Track 4: API provider updated

## Files to Modify

### Graph Logic (Primary)
- `src/routes/graph/logic/graph.ts` (~230 lines)
- `src/routes/graph/logic/svelte-flow.ts`
- `src/routes/graph/logic/search.ts`
- `src/routes/graph/types.ts` (minimal)

### UI Components
- `src/routes/graph/TaskEditor.svelte` (381 lines)
- `src/routes/graph/TaskNode.svelte`
- `src/routes/graph/TaskListItem.svelte`
- `src/routes/graph/TaskList.svelte`
- `src/routes/planner/TaskListItem.svelte`
- Any other components accessing task fields

## Expected Impact

### ✅ No Changes Needed (API Provider Handles It)
Since `ConvexTaskProvider` maintains the flat `ITask` structure for backward compatibility, most components that receive `Task` objects from the API won't need updates.

### ⚠️ Changes Needed

1. **Type definitions** that reference task structure
2. **Components** that create new task objects directly
3. **Graph logic** that manipulates task data
4. **Search/filter** logic accessing task fields

## Key Changes by File

### 1. `src/routes/graph/types.ts`

**Current:**
```typescript
export type FlowData<T extends Task = Task> = { task: T, dimmed?: boolean };
```

**Assessment**: Should stay as-is since Task is the legacy type maintained by API provider. Only update if moving to native Node<TaskData> format (future enhancement).

### 2. `src/routes/graph/logic/graph.ts`

**Review areas:**
- Line 48: `refreshNodesData(tasks: Task[])` - Should work as-is
- Line 52: `taskById.set(t.id, t)` - Should work as-is
- Line 62: `data: { task: t }` - Should work as-is

**Assessment**: Likely no changes needed if API provider maintains Task format.

### 3. `src/routes/graph/TaskEditor.svelte`

**Review for:**
- Form field bindings (title, content, status)
- Date handling (todaysTask, dueDate)
- Parent/child relationship editing

**Pattern check:**
```svelte
<input bind:value={task.title} />
<textarea bind:value={task.content} />
```

**Assessment**: Should work as-is with flat Task structure from API.

### 4. `src/routes/graph/TaskNode.svelte`

**Review for:**
- Display of task properties
- Status indicators
- Type checking (root vs task)

**If accessing type:**
```svelte
{#if task.type === "root"}
  <!-- Root/project styling -->
{:else}
  <!-- Normal task styling -->
{/if}
```

**Assessment**: Should work as-is (type is mapped by API provider).

### 5. Search/Filter Logic

**`src/routes/graph/logic/search.ts`**

Check for field access patterns:
```typescript
tasks.filter(t => t.title.includes(searchTerm))
tasks.filter(t => t.status === TaskStatus.complete)
```

**Assessment**: Should work as-is with flat Task structure.

## Migration Strategy

### Phase 1: Verification (No Code Changes)
1. With API provider updated, run the app
2. Test all UI interactions
3. Verify no runtime errors
4. Check console for warnings

### Phase 2: Type Cleanup (Optional)
If moving to native Node types in the future:

1. Update `FlowData` to work with `Node<TaskData>`
2. Update graph logic to handle nested structure
3. Update components to use `task.data.title` etc.

This is a **future enhancement**, not required for initial migration.

## Testing Checklist

### Graph View (`/graph`)
- [ ] Tasks render correctly
- [ ] Can create new task
- [ ] Can edit task title
- [ ] Can edit task content
- [ ] Can change task status
- [ ] Can add/remove parent relationships
- [ ] Can add/remove child relationships
- [ ] Search works
- [ ] Filter works
- [ ] Layout engine works
- [ ] Root/project nodes styled correctly

### Task Editor
- [ ] Opens when clicking task
- [ ] All fields populate correctly
- [ ] Can save changes
- [ ] Date pickers work (todaysTask, dueDate)
- [ ] Relationship editing works

### Planner View (`/planner`)
- [ ] Today's tasks show correctly
- [ ] Can mark tasks complete
- [ ] Status updates reflect in graph

### General
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No visual regressions

## Potential Issues

### Issue 1: Direct Task Creation
**If components create tasks directly (not via API):**
```typescript
// This would break:
const newTask: Task = { ...directObjectLiteral };
```

**Solution**: Always use API methods (createTask) rather than direct object creation.

### Issue 2: Type Assertions
**If code does:**
```typescript
const task = data as Task;
```

**Assessment**: Should still work since API returns Task type.

### Issue 3: Deep Equality Checks
**If comparing entire task objects:**
```typescript
if (task1 === task2) // reference equality - OK
if (_.isEqual(task1, task2)) // deep equality - OK
```

**Assessment**: Should work as-is.

## Performance Considerations

No significant performance impact expected since:
- API provider does the conversion once per query/mutation
- UI components work with the same flat structure
- No additional re-renders needed

## Future Enhancements

### Native Node Support
Once migration is stable, consider:

1. **New component variants** that work with Node<TaskData>
2. **Gradual migration** of components to native format
3. **Type discrimination** for project vs task rendering
4. **Better type safety** with discriminated unions

### Project Support
Add UI for:
- Creating projects
- Viewing project subtrees
- Switching between projects
- Project-specific styling

## Validation Checklist

- [ ] App runs without errors
- [ ] All graph interactions work
- [ ] Task CRUD operations work
- [ ] Search/filter works
- [ ] No TypeScript errors
- [ ] No visual regressions
- [ ] Performance acceptable
- [ ] Console clean (no warnings)

## Estimated Effort
- Verification testing: 2-3 hours
- Bug fixes (if any): 2-4 hours
- **Total: 4-7 hours**

## Notes

Since the API provider maintains backward compatibility with the flat `Task` structure, **most UI components should work without changes**. This track is primarily about verification and handling any edge cases that arise.

The heavy lifting is done in Tracks 3 (backend) and 4 (API provider). Track 5 is about ensuring everything still works end-to-end.



