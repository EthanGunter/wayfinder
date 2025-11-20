# Migration Quick Start Guide

## What's Done ✅

### Track 1: Database Migration
- ✅ Migration mutation created: `migrateTasksToNodesCustom`
- ✅ Schema updated with temporary tasks table
- ✅ ID mapping logic implemented
- ✅ Root → Project conversion ready

### Track 2: Domain Models
- ✅ `INode<T>` generic interface
- ✅ `IProjectData<T>` interface
- ✅ `ITaskData<T>` interface  
- ✅ Legacy `ITask<T>` preserved for compatibility
- ✅ Relationship utilities updated
- ✅ All exports centralized in `src/domain/models/index.ts`

## What's Next ⏳

### Immediate: Track 3 (Backend)
**Goal**: Update `src/convex/tasks.ts` to work with nodes table

**Reference**: `Documentation/migration/TRACK-3-BACKEND.md`

**Key Tasks**:
1. Update type definitions (DBTask → DBNode)
2. Change all `query("tasks")` → `query("nodes")`
3. Update field access: `task.title` → `node.data.title`
4. Update type checks: `type === "root"` → `data.type === "project"`
5. Fix insert/patch operations for nested structure
6. Update `cleanTaskForClient` conversion function
7. Update all 1969 lines of tests

**Estimated Time**: 18-26 hours

### After Track 3: Track 4 (API Provider)
**Goal**: Update `ConvexTaskProvider.ts` to convert between server and client formats

**Reference**: `Documentation/migration/TRACK-4-API-PROVIDER.md`

**Key Tasks**:
1. Update `convertFromServerTask` → `convertFromServerNode`
2. Update `convexifyCreateTaskDetails` for nested structure
3. Update `convexifyTaskUpdate` for partial nested updates
4. Test round-trip conversions

**Estimated Time**: 5-7 hours

### Finally: Track 5 (UI Components)
**Goal**: Verify UI works with updated backend

**Reference**: `Documentation/migration/TRACK-5-UI-COMPONENTS.md`

**Key Tasks**:
1. Run application end-to-end
2. Test all CRUD operations
3. Verify graph interactions
4. Fix any edge cases
5. Performance check

**Estimated Time**: 4-7 hours

## Running Tracks in Parallel

You can run multiple agents in parallel with these dependencies:

```
Agent 1: Track 3 (start immediately)
         ↓ (after ~80% done)
Agent 2: Track 4 (start when Track 3 is mostly complete)
         ↓ (after Track 4 done)
Agent 3: Track 5 (start when Track 4 is complete)
```

## Commands for Each Agent

### Starting Track 3 Agent
```
I need you to complete Track 3 of the node migration. 

Context: We've split the tasks table into a nodes table with embedded data. 
Tracks 1 & 2 are complete (migration + domain models).

Your job: Update src/convex/tasks.ts and tests to work with the new structure.

Reference: Read Documentation/migration/TRACK-3-BACKEND.md for detailed instructions.

Key changes:
- query("tasks") → query("nodes")
- task.title → node.data.title
- type === "root" → data.type === "project"
- Update insert/patch for nested structure
- Fix all tests

Start by reading the TRACK-3-BACKEND.md file, then begin implementation.
```

### Starting Track 4 Agent
```
I need you to complete Track 4 of the node migration.

Context: Backend (Track 3) is complete. Nodes table uses nested data structure.

Your job: Update src/lib/API/Tasks/ConvexTaskProvider.ts to convert between 
server format (nodes with nested data) and client format (flat Task objects).

Reference: Read Documentation/migration/TRACK-4-API-PROVIDER.md for detailed instructions.

Key changes:
- Update convertFromServerTask → convertFromServerNode
- Handle nested data in create/update conversions
- Maintain backward compatibility

Start by reading the TRACK-4-API-PROVIDER.md file, then begin implementation.
```

### Starting Track 5 Agent
```
I need you to complete Track 5 of the node migration.

Context: Backend and API provider updated. UI should mostly work via API compatibility layer.

Your job: Verify UI works end-to-end and fix any issues.

Reference: Read Documentation/migration/TRACK-5-UI-COMPONENTS.md for detailed instructions.

Focus:
- Verification testing
- Fix any edge cases
- Ensure no console errors
- Check performance

Start by reading the TRACK-5-UI-COMPONENTS.md file, then begin verification.
```

## Testing the Migration (After All Tracks)

### 1. Deploy Backend
```bash
npx convex deploy
```

### 2. Run Migration
Open Convex dashboard → Functions → Run mutation:
```
migrations.migrateTasksToNodesCustom
Arguments: {}
```

### 3. Verify Results
Check console output for:
- Number of nodes created
- Number of relationships updated
- Any warnings or errors

### 4. Test Application
- Create a task
- Edit a task
- Change relationships
- Complete a task
- Search/filter
- Check graph view

### 5. Remove Deprecated Table (After Verification)
Update `src/convex/schema.ts`:
- Remove `TaskNodeDef_DEPRECATED`
- Remove `tasks` table from schema
- Redeploy

## Files Changed Summary

### Created
- `src/domain/models/node.ts`
- `src/domain/models/project.ts`
- `src/domain/models/index.ts`
- `Documentation/migration/*.md` (5 files)

### Modified
- `src/convex/schema.ts` (added nodes table, temporary tasks table)
- `src/convex/migrations.ts` (added migration mutation)
- `src/domain/models/task.ts` (added TaskData, marked ITask deprecated)

### To Be Modified (Tracks 3-5)
- `src/convex/tasks.ts`
- `src/convex/tasks.test.ts`
- `src/lib/API/Tasks/ConvexTaskProvider.ts`
- UI components (minimal changes expected)

## Getting Help

- **Track-specific questions**: Check the relevant `TRACK-X-*.md` file
- **Overall questions**: Check `MIGRATION-OVERVIEW.md`
- **Schema questions**: Check `src/convex/schema.ts` comments
- **Type questions**: Check `src/domain/models/` files

## Rollback

If something goes wrong:
1. Convex keeps automatic backups
2. Tasks table still exists (marked deprecated)
3. Can restore to previous deployment
4. Migration is idempotent (safe to re-run)

---

Good luck! The hard architectural work is done. Now it's just systematic updates.



