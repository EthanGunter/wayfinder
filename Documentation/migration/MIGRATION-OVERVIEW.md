# Node-Task Data Migration - Master Overview

## Executive Summary

**Goal**: Migrate from unified `tasks` table to `nodes` table with embedded discriminated union data (ProjectData | TaskData). This separates graph structure from node content, enabling multiple node types and better extensibility.

**Status**: Tracks 1 & 2 Complete ✅

## Architecture Change

### Before (Old Schema)
```
tasks table:
  - _id: Id<'tasks'>
  - userAuthId: string
  - type: "task" | "root"
  - parents: string[]
  - children: string[]
  - title: string
  - content?: string
  - status: number
  - todaysTask?: number
  - dueDate?: number
  - created: number
  - lastEdit: number
```

### After (New Schema)
```
nodes table:
  - _id: Id<'nodes'>
  - userAuthId: string
  - parents: string[]        ← Graph structure
  - children: string[]       ← Graph structure
  - created: number          ← Graph metadata
  - lastEdit: number         ← Graph metadata
  - data: {                  ← Content (discriminated union)
      type: "task" | "project"
      title: string
      content?: string
      status: number
      todaysTask?: number    ← Only if type === "task"
      dueDate?: number
    }
```

## Key Benefits

1. **Separation of Concerns**: Graph structure independent of content
2. **Extensibility**: Easy to add new node types (projects, notes, links, etc.)
3. **Type Safety**: Discriminated unions provide better TypeScript support
4. **Future-Proof**: Architecture supports multi-project views and complex relationships
5. **Clean Domain Model**: Clear boundaries between graph and data

## Migration Tracks

### ✅ Track 1: Database Migration (COMPLETE)
- **File**: `src/convex/migrations.ts`
- **Deliverable**: `migrateTasksToNodesCustom` mutation
- **Status**: Complete, ready to run in production
- **Key Points**:
  - Handles ID mapping (old task IDs → new node IDs)
  - Converts "root" → "project"
  - Preserves all data and relationships
  - Idempotent (safe to re-run)

### ✅ Track 2: Domain Models (COMPLETE)
- **Files**: 
  - `src/domain/models/node.ts` (new)
  - `src/domain/models/project.ts` (new)
  - `src/domain/models/task.ts` (updated)
  - `src/domain/models/index.ts` (new)
- **Deliverables**: 
  - `INode<T>` generic interface
  - `IProjectData<T>` interface
  - `ITaskData<T>` interface
  - Updated relationship utilities
  - Legacy `ITask` marked deprecated
- **Status**: Complete, types defined and exported

### ⏳ Track 3: Backend API (IN PROGRESS)
- **Files**: 
  - `src/convex/tasks.ts` (989 lines)
  - `src/convex/tasks.test.ts` (1969 lines)
- **Effort**: 18-26 hours
- **See**: `TRACK-3-BACKEND.md` for detailed plan
- **Key Changes**:
  - Update all database operations (tasks → nodes)
  - Update field access (flat → nested)
  - Update type checks (type === "root" → data.type === "project")
  - Fix all tests

### ⏳ Track 4: API Provider (PENDING)
- **File**: `src/lib/API/Tasks/ConvexTaskProvider.ts` (431 lines)
- **Effort**: 5-7 hours
- **See**: `TRACK-4-API-PROVIDER.md` for detailed plan
- **Key Changes**:
  - Update conversion functions (server ↔ client)
  - Handle nested data in create/update operations
  - Maintain backward compatibility with flat Task structure

### ⏳ Track 5: UI Components (PENDING)
- **Files**: Graph logic + UI components
- **Effort**: 4-7 hours
- **See**: `TRACK-5-UI-COMPONENTS.md` for detailed plan
- **Key Changes**:
  - Verification testing (should mostly work via API provider)
  - Fix any direct task object creation
  - Handle edge cases

## Dependency Graph

```
Track 1 (Migration) ✅
    ↓
Track 2 (Domain Models) ✅
    ↓
Track 3 (Backend) ⏳ ← START HERE NEXT
    ↓
Track 4 (API Provider) ⏳
    ↓
Track 5 (UI Components) ⏳
```

## Running the Migration

### Prerequisites
1. Ensure Track 3 (Backend) is complete
2. Ensure Track 4 (API Provider) is complete
3. Have a database backup (Convex handles this automatically)

### Steps
1. Deploy updated backend code
2. Run migration mutation:
   ```typescript
   await client.mutation(api.migrations.migrateTasksToNodesCustom, {});
   ```
3. Verify migration results
4. Deploy frontend with updated API provider
5. Test end-to-end
6. Remove deprecated `tasks` table from schema

### Verification Queries
```typescript
// Check all nodes were created
const nodeCount = await ctx.db.query("nodes").collect().length;

// Check relationships are intact
const nodes = await ctx.db.query("nodes").collect();
for (const node of nodes) {
  // Verify parents/children exist
  for (const parentId of node.parents) {
    const parent = await ctx.db.get(parentId as Id<'nodes'>);
    if (!parent) console.error(`Missing parent: ${parentId}`);
  }
}

// Check projects exist
const projects = await ctx.db.query("nodes")
  .withIndex("by_user_type", q => q.eq("userAuthId", authId).eq("data.type", "project"))
  .collect();
console.log(`Found ${projects.length} projects`);
```

## Rollback Plan

If issues occur:
1. **Before removing tasks table**: Keep both tables, switch back to tasks
2. **After removing tasks table**: Restore from Convex backup
3. **During migration**: Migration is idempotent, safe to re-run

## Current Blockers

- None for Track 3 to begin
- Track 3 must complete before Track 4
- Track 4 must complete before Track 5

## Communication Between Agents

### For Track 3 Agent
- Use domain models from `src/domain/models/`
- Follow patterns in `TRACK-3-BACKEND.md`
- Test thoroughly before marking complete
- Update this doc with any issues found

### For Track 4 Agent
- Wait for Track 3 to be ~80% complete
- Use conversion patterns in `TRACK-4-API-PROVIDER.md`
- Maintain backward compatibility
- Test with actual backend

### For Track 5 Agent
- Wait for Track 4 to complete
- Primarily verification and testing
- Fix only what breaks
- Document any API compatibility issues

## Testing Strategy

### Unit Tests
- Track 3: Update all backend tests
- Track 4: Test conversion functions
- Track 5: Component tests (if they exist)

### Integration Tests
- Create → Read → Update → Read roundtrip
- Relationship propagation
- Date conversion accuracy
- Search/filter functionality

### Manual Testing
- Create tasks in UI
- Edit tasks
- Change relationships
- Complete tasks
- Check today's list
- Verify graph layout
- Test project functionality

## Success Criteria

- [x] Migration runs successfully (Track 1)
- [x] Domain models defined (Track 2)
- [ ] All backend tests pass (Track 3)
- [ ] API provider converts correctly (Track 4)
- [ ] UI works end-to-end (Track 5)
- [ ] No data loss in production
- [ ] No performance degradation
- [ ] Type safety maintained
- [ ] Zero console errors

## Timeline Estimate

- Track 1: Complete (2 hours)
- Track 2: Complete (3 hours)
- Track 3: 18-26 hours
- Track 4: 5-7 hours
- Track 5: 4-7 hours
- **Total Remaining**: 27-40 hours across 3 tracks

## Next Steps

1. **Immediate**: Start Track 3 (Backend)
2. **After Track 3**: Start Track 4 (API Provider)
3. **After Track 4**: Start Track 5 (UI Components)
4. **After Track 5**: Run production migration

## Questions / Issues

Document any issues or questions here as they arise during migration.

---

**Last Updated**: 2025-11-20 (Tracks 1 & 2 complete)



