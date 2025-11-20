# Track 4: Frontend API Provider Migration

## Overview
Update `ConvexTaskProvider.ts` to transform between the new backend node structure and the client-side API.

## Dependencies
- ✅ Track 1: Migration complete
- ✅ Track 2: Domain models defined
- ⏳ Track 3: Backend must be mostly complete (or progressing in parallel)

## Current State
- Backend using `nodes` table with nested data
- Client still expects flat `ITask` structure (legacy)
- Provider acts as translation layer

## File to Modify
- `src/lib/API/Tasks/ConvexTaskProvider.ts` (431 lines)

## Key Changes Required

### 1. Import Updates

**Add new imports:**
```typescript
import type { Node, NodeWithNumberTimestamps, TaskData, ProjectData } from "$domain/models";
```

### 2. Type Conversions

#### convertFromServerTask (Lines ~40-50)

**Current signature:**
```typescript
function convertFromServerTask(serverTask: any): Task
```

**Purpose**: Converts Convex response (number timestamps) to client format (Date timestamps)

**Update needed:**
```typescript
function convertFromServerNode(serverNode: NodeWithNumberTimestamps<TaskData | ProjectData>): Task {
    // Map nested data back to flat structure for backward compatibility
    return {
        id: serverNode.id,
        userAuthId: serverNode.userAuthId,
        type: serverNode.data.type === "project" ? "root" : "task",
        title: serverNode.data.title,
        content: serverNode.data.content,
        status: serverNode.data.status,
        todaysTask: serverNode.data.type === "task" && serverNode.data.todaysTask 
            ? new Date(serverNode.data.todaysTask) 
            : undefined,
        dueDate: serverNode.data.dueDate ? new Date(serverNode.data.dueDate) : undefined,
        parents: serverNode.parents,
        children: serverNode.children,
        created: new Date(serverNode.created),
        lastEdit: new Date(serverNode.lastEdit),
    };
}
```

#### convexifyCreateTaskDetails (Lines ~200-220)

**Current signature:**
```typescript
function convexifyCreateTaskDetails(params: CreateTaskParams): any
```

**Purpose**: Converts client create params to Convex format

**Update needed:**
```typescript
function convexifyCreateTaskDetails(params: CreateTaskParams): any {
    // Extract data fields vs graph fields
    const dataFields = {
        type: "task" as const,
        title: params.title,
        content: params.content,
        status: params.status,
        todaysTask: params.todaysTask instanceof Date ? params.todaysTask.getTime() : params.todaysTask,
        dueDate: params.dueDate instanceof Date ? params.dueDate.getTime() : params.dueDate,
    };

    const graphFields = {
        id: params.id,
        userAuthId: params.userAuthId,
        parents: params.parents,
        children: params.children,
        created: params.created instanceof Date ? params.created.getTime() : params.created,
        lastEdit: params.lastEdit instanceof Date ? params.lastEdit.getTime() : params.lastEdit,
    };

    return {
        ...graphFields,
        data: dataFields,
    };
}
```

#### convexifyTaskUpdate (Lines ~250-280)

**Current signature:**
```typescript
function convexifyTaskUpdate(update: UpdateTaskParams): any
```

**Purpose**: Converts client update params to Convex format

**Critical**: Must handle nested data updates properly

**Update needed:**
```typescript
function convexifyTaskUpdate(update: UpdateTaskParams): any {
    const { id, data } = update;
    
    // Separate graph-level updates from data-level updates
    const graphUpdates: any = {};
    const dataUpdates: any = {};

    // Graph fields stay at top level
    if (data.parents !== undefined) graphUpdates.parents = data.parents;
    if (data.children !== undefined) graphUpdates.children = data.children;
    if (data.addParents !== undefined) graphUpdates.addParents = data.addParents;
    if (data.removeParents !== undefined) graphUpdates.removeParents = data.removeParents;
    if (data.addChildren !== undefined) graphUpdates.addChildren = data.addChildren;
    if (data.removeChildren !== undefined) graphUpdates.removeChildren = data.removeChildren;
    if (data.created !== undefined) {
        graphUpdates.created = data.created instanceof Date ? data.created.getTime() : data.created;
    }
    if (data.lastEdit !== undefined) {
        graphUpdates.lastEdit = data.lastEdit instanceof Date ? data.lastEdit.getTime() : data.lastEdit;
    }

    // Data fields go into nested data object
    if (data.title !== undefined) dataUpdates.title = data.title;
    if (data.content !== undefined) dataUpdates.content = data.content;
    if (data.status !== undefined) dataUpdates.status = data.status;
    if (data.todaysTask !== undefined) {
        dataUpdates.todaysTask = data.todaysTask instanceof Date ? data.todaysTask.getTime() : data.todaysTask;
    }
    if (data.dueDate !== undefined) {
        dataUpdates.dueDate = data.dueDate instanceof Date ? data.dueDate.getTime() : data.dueDate;
    }

    return {
        id,
        data: {
            ...graphUpdates,
            ...(Object.keys(dataUpdates).length > 0 ? { data: dataUpdates } : {}),
        },
    };
}
```

**IMPORTANT**: Backend needs to handle partial data updates - may need to fetch existing node and merge.

### 3. API Method Updates

All API methods need to use the new conversion functions:

**Pattern:**
```typescript
// Old
const res = await client.mutation(convexApi.tasks.createTask, { createDetail });
return ok({
    created: convertFromServerTask(res.created),
    affected: res.affected.map(convertFromServerTask)
});

// New (same, just ensure conversion functions are updated)
const res = await client.mutation(convexApi.tasks.createTask, { createDetail });
return ok({
    created: convertFromServerNode(res.created),
    affected: res.affected.map(convertFromServerNode)
});
```

### 4. Query Store Updates (Lines ~100-150)

**Subscriptions using createFetchable:**

```typescript
export const allTasks = createFetchable(
    () => client.query(convexApi.tasks.getTasks),
    (data) => data?.map(convertFromServerNode) ?? []
);
```

Ensure all query stores use the updated conversion function.

### 5. Future: Native Node API

**Consider adding (optional):**

```typescript
// New API that works with nodes directly (no legacy conversion)
export const nodesApi = {
    createNode: async ({ nodeData }) => { ... },
    updateNode: async ({ id, updates }) => { ... },
    // etc.
};
```

This allows new code to work with the modern structure while keeping legacy support.

## Testing Strategy

### Manual Testing
1. Create a task → verify it appears correctly
2. Update task title → verify change persists
3. Add/remove parent relationships → verify graph updates
4. Set todaysTask → verify it shows in today's list
5. Complete a task → verify status changes

### Integration Testing
- Test with actual Convex backend running
- Verify round-trip: create → read → update → read
- Check console for any conversion errors
- Verify dates convert properly (Date ↔ number)

## Edge Cases

1. **Undefined optional fields**: Handle gracefully in conversions
2. **Type narrowing**: todaysTask only on tasks, not projects
3. **Date conversion**: Null vs undefined vs valid Date
4. **Partial updates**: Don't overwrite unspecified fields

## Validation Checklist

- [ ] convertFromServerTask → convertFromServerNode updated
- [ ] convexifyCreateTaskDetails handles nested data
- [ ] convexifyTaskUpdate handles nested data properly
- [ ] All API methods use new conversions
- [ ] All query stores updated
- [ ] Manual testing passes
- [ ] No TypeScript errors
- [ ] Date conversions working correctly

## Estimated Effort
- Code changes: 3-4 hours
- Testing & debugging: 2-3 hours
- **Total: 5-7 hours**



