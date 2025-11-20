# Track 3: Backend API Migration (Convex)

## Overview
Update the Convex backend (`tasks.ts`) to work with the new `nodes` table and nested data structure.

## Current State
- Schema updated: `nodes` table exists with discriminated union `data` field
- Domain models updated: `INode<T>`, `ITaskData`, `IProjectData` defined
- Migration ready: `migrateTasksToNodesCustom` mutation available

## Files to Modify

### Primary File
- `src/convex/tasks.ts` (989 lines) - **Major refactor required**

### Test File
- `src/convex/tasks.test.ts` (1969 lines) - **All tests need updates**

## Key Changes Required

### 1. Type Definitions (Lines 8-48)

**Current:**
```typescript
type DBTask = Doc<'tasks'>;
type ClientTask = ITask<number>;
```

**Change to:**
```typescript
type DBNode = Doc<'nodes'>;
type ClientTask = ITask<number>; // Keep for backward compatibility
type ClientNode<T> = INodeBase<T, number>; // New type
```

### 2. Database Operations

**Pattern to find and replace:**
- `ctx.db.query("tasks")` → `ctx.db.query("nodes")`
- `ctx.db.get(id as Id<'tasks'>)` → `ctx.db.get(id as Id<'nodes'>)`
- `ctx.db.insert("tasks", {...})` → `ctx.db.insert("nodes", {...})`
- `ctx.db.patch(id, {...})` → Update to patch nested `data` fields

### 3. Field Access Updates

**Old flat structure:**
```typescript
task.title
task.content
task.status
task.todaysTask
task.dueDate
```

**New nested structure:**
```typescript
node.data.title
node.data.content
node.data.status
node.data.todaysTask  // Only for type === "task"
node.data.dueDate
```

**Graph fields stay at top level:**
```typescript
node.parents
node.children
node.created
node.lastEdit
```

### 4. Type Checking Updates

**Old:**
```typescript
if (task.type === "root") { ... }
```

**New:**
```typescript
if (node.data.type === "project") { ... }
```

### 5. Insert/Patch Operations

**Old:**
```typescript
await ctx.db.insert("tasks", {
    userAuthId,
    type: "task",
    title,
    content,
    status,
    todaysTask,
    dueDate,
    parents,
    children,
    lastEdit,
    created,
});
```

**New:**
```typescript
await ctx.db.insert("nodes", {
    userAuthId,
    parents,
    children,
    lastEdit,
    created,
    data: {
        type: "task",
        title,
        content,
        status,
        todaysTask,
        dueDate,
    },
});
```

### 6. Patch Operations (Partial Updates)

Need to handle nested updates carefully:

```typescript
// For data field updates
await ctx.db.patch(id, {
    data: {
        ...node.data,
        title: newTitle,
    }
});

// For graph field updates
await ctx.db.patch(id, {
    parents: newParents,
    lastEdit: now,
});
```

### 7. Query Index Updates

**Old:**
```typescript
.withIndex("by_todays_task", q => q.eq("userAuthId", authId))
```

**New:**
```typescript
.withIndex("by_users_daily_tasks", q => q.eq("userAuthId", authId))
```

### 8. Root → Project Migration

**Old getOrCreateRoot function:**
```typescript
export async function getOrCreateRoot(ctx, userAuthId: string): Promise<Doc<'tasks'>>
```

**Change to getOrCreateProject:**
```typescript
export async function getOrCreateProject(ctx, userAuthId: string): Promise<Doc<'nodes'>>
```

Update to create project nodes instead of root tasks.

### 9. cleanTaskForClient Function

This converts DB format to client format. Update to handle nested structure:

```typescript
function cleanTaskForClient(node: DBNode): ClientTask {
    return {
        id: String(node._id),
        userAuthId: node.userAuthId,
        type: node.data.type === "project" ? "root" : "task", // Map back for compatibility
        title: node.data.title,
        content: node.data.content,
        status: node.data.status,
        todaysTask: node.data.type === "task" ? node.data.todaysTask : undefined,
        dueDate: node.data.dueDate,
        parents: node.parents,
        children: node.children,
        created: node.created,
        lastEdit: node.lastEdit,
    };
}
```

## Testing Strategy

### Unit Tests (`tasks.test.ts`)

1. **Setup/Teardown**: Update to work with nodes table
2. **Create tests**: Verify nodes created with correct nested structure
3. **Update tests**: Verify partial updates work with nested data
4. **Relationship tests**: Verify parent/child updates still work
5. **Query tests**: Update all query assertions
6. **Project tests**: Add tests for project node creation

### Test Pattern Updates

**Old:**
```typescript
const task = await ctx.db.query("tasks").first();
expect(task?.title).toBe("Test Task");
```

**New:**
```typescript
const node = await ctx.db.query("nodes").first();
expect(node?.data.title).toBe("Test Task");
expect(node?.data.type).toBe("task");
```

## Migration Steps

1. **Phase 1**: Update type definitions
2. **Phase 2**: Update database operations (query/get/insert/patch)
3. **Phase 3**: Update field access patterns throughout
4. **Phase 4**: Update cleanTaskForClient and helper functions
5. **Phase 5**: Update all tests
6. **Phase 6**: Run tests and fix issues
7. **Phase 7**: Remove deprecated tasks table references

## Gotchas & Common Issues

1. **Partial updates**: Must spread existing `data` object when patching
2. **Type narrowing**: TypeScript may need help with discriminated unions
3. **todaysTask field**: Only exists on task nodes, not project nodes
4. **Index names**: Changed in schema, update all .withIndex() calls
5. **String IDs**: Continue using String(id) for parent/child arrays

## Validation Checklist

- [ ] All `ctx.db.query("tasks")` converted to `nodes`
- [ ] All field accesses updated (flat → nested)
- [ ] All type checks updated (task.type → task.data.type)
- [ ] All inserts use new structure
- [ ] All patches handle nested data correctly
- [ ] getOrCreateRoot → getOrCreateProject
- [ ] cleanTaskForClient updated
- [ ] All tests passing
- [ ] No references to 'tasks' table remain

## Estimated Effort
- Code changes: 8-12 hours
- Test updates: 6-8 hours
- Debugging & validation: 4-6 hours
- **Total: 18-26 hours**



