//#region Mutations

/** Create a single task node. Validates parent relationships, ensures task belongs to a project ancestor, and propagates bidirectional relationship changes. Returns the created task and any affected nodes. */
export { createTask } from './tasks';

/** Create multiple tasks in batch. Each task is created individually with full validation and relationship propagation. Returns all created tasks and deduplicated affected nodes. */
export { createTasks } from './tasks';

/** Update a single task node. Supports partial updates of fields, parent/child relationships (with add/remove operations), and enforces project constraints. Automatically reorders completed tasks to end of parent lists. Returns updated task and affected nodes. */
export { updateTask } from './tasks';

/** Update multiple tasks in batch. Each update is processed individually with full validation. Returns all updated tasks and deduplicated affected nodes. */
export { updateTasks } from './tasks';

/** Delete a single task node. Propagates relationship changes to affected nodes before deletion. Returns affected nodes that had their relationships updated. */
export { deleteTask } from './tasks';

/** Delete multiple tasks in batch. Each deletion propagates relationship changes. Returns deduplicated affected nodes. */
export { deleteTasks } from './tasks';

/** Import task and project data from JSON export format. Supports replace, add, and attemptMerge modes. Handles ID remapping, relationship normalization, and ensures all tasks belong to valid projects. Returns count of imported nodes. */
export { importData } from './tasks';

/** Export all user's tasks and projects as JSON. Includes version metadata and export timestamp. */
export { exportData } from './tasks';

//#endregion

//#region Queries

/** Get a single task or project node by ID. Returns client-formatted node (with id instead of _id). */
export { getTask } from './tasks';

/** Get multiple nodes by their IDs. Throws if any node is not found. Returns client-formatted nodes. */
export { getTasks } from './tasks';

/** Get all task nodes (excluding projects) for a given user ID. Returns client-formatted task nodes. */
export { getAllUserTasks } from './tasks';

/** Get all direct children of a node, preserving the order from the parent's children array. Returns client-formatted nodes. */
export { getChildrenOf } from './tasks';

/** Get all direct parents of a node. Tasks can have multiple parents. Returns client-formatted nodes. */
export { getParentsOf } from './tasks';

/** Get all siblings of a node, grouped by parent. Returns array of [parent, siblings[]] tuples, with siblings sorted according to each parent's children order. Handles multi-parent scenarios. */
export { getSiblingsOf } from './tasks';

/** Get all tasks marked as "today's task" for the current user. Filters by UTC day boundaries. Returns client-formatted task nodes. */
export { getTodaysTasks } from './tasks';

/** Get prioritized tasks for a project subtree. Traverses tree depth-first, inheriting due dates from ancestors, and returns incomplete leaf tasks (or parent tasks if all children complete) sorted by due date. Includes flag indicating if due date was inherited. */
export { getPrioritizedTasks } from './tasks';

/** Search tasks by text query. Currently throws NotImplementedError. */
export { searchTasks } from './tasks';

//#endregion

//#region Projects - Mutations

/** Create a new project node. Projects are top-level containers with no parents. Applies user's default UI preferences for project metrics display. Returns client-formatted project node. */
export { createProject } from './tasks';

/** Update a project node. Projects cannot have their parents modified. Supports updating children, title, content, status, due date, and UI preferences. Returns updated project and affected child nodes. */
export { updateProject } from './tasks';

//#endregion

//#region Projects - Queries

/** Get all projects for the current user with calculated metrics (progress, streak, velocity, momentum score, next action, micro wins, smart timestamp). Returns projects with embedded metrics. */
export { getProjects } from './tasks';

/** Get the complete subtree of nodes under a project, including the project itself. Traverses all descendants via children relationships. Returns client-formatted nodes. */
export { getProjectSubtree } from './tasks';

/** Get immediate children IDs of a node. Lightweight query that returns only the children array. */
export { getSubtree } from './tasks';

//#endregion

//#region Internal Utilities

/** Resolve the project ancestor for a given node by traversing parent chain upward until a project is found. Throws if cycle detected or no project ancestor exists. Used internally for relationship validation. */
export { resolveProjectAncestor } from './tasks';

/** Normalize and validate task parent relationships. Ensures all parents share the same project ancestor, removes duplicate parents, and handles project parent deduplication. Returns normalized parents array and the project ancestor. Used internally by task mutations. */
export { cleanupTaskParentsAndProjectRelationships } from './tasks';

/** Propagate relationship changes to affected nodes when tasks are created, updated, or deleted. Calculates necessary relationship updates using shared domain logic and applies them, ensuring bidirectional consistency. Handles orphan protection by adopting project ancestor when needed. Returns all affected nodes. Used internally by task mutations. */
export { propagateRelationshipChanges } from './tasks';

//#endregion
