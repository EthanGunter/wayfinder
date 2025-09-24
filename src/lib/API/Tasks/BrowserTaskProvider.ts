import { type ITaskAdvancedFeatures, type ITaskExporter, type ITasks, type ITaskRelations, type ITaskCoreResponseHandler, type CreateTaskParams, type UpdateTaskParams, type TaskDelta, type ITaskCoreLocal, type ILocalTasks } from './types';
import { err, ok } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, NotImplementedError, InvalidStateError, ArgumentError, NotAuthorizedError, ErrorType } from '$lib/Errors';
import type { Task } from './Task';
import { createTask, toMarkdown, isTaskCompleted } from './Task';
import { getRelationshipUpdates } from '.';
import JSZip from 'jszip';
import { TaskSearchService } from './TaskSearchService';
import { dbPromise, TASK_TABLE_NAME, AUTH_TABLE_NAME, APP_TABLE_NAME, ACTIVEUSER_NAME, type LocalDB } from '../localDB';
import { remoteTasks as remoteTasksStore } from '$lib/stores/remoteTasks';
import { readable, type Readable } from 'svelte/store';
import { userHasFeature, type User } from '../Auth/User';
import { okBatch, type BatchResult } from '../types';
// import { queueTaskSyncCommand } from './types';


//#region Task CRUD
const taskCRUD: ITaskCoreLocal & ITaskCoreResponseHandler = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function ({ createDetail: task }) {
    const res = await _createTasksLocal([task]);

    if (res.isErr()) {
      return err(res.error);
    }
    const { successes, errors } = res.value;

    if (errors.length > 0) return err(errors[0]);

    // TODO:sync/tasks/refactor This should be returning void...
    return ok({ oldId: "", newId: "" });
  },

  /**
  * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
  * @error {@link IOError} if the IndexedDB.put() attempt fails
  */
  createTasks: async ({ createDetails }) => {
    const res = await _createTasksLocal(createDetails);
    if (res.isErr()) return err(res.error);

    // TODO:sync/tasks/refactor This should be returning void...
    return ok({ updatedIds: new Map<string, string>() });
  },
  handleCreateTasksResponse: async function (response) {
    if (response.isOk()) {
      const updated = response.value.updatedIds;
      await _remapLocalIdsAndRelationships(updated);
    }
    else {
      const { idsToDelete, error } = response.error;
      const user = await getCurrentUser();
      const hasSync = user ? userHasFeature(user, 'task-sync') : false;
      if (error.type === ErrorType.NotAuthorizedError && !hasSync) {
        console.warn('[Sync] createTasks unauthorized; user lacks task-sync. Keeping local tasks', idsToDelete);
        return;
      }
      new IOError('Remote createTasks failed; reverting local', response.error).logError();
      await _deleteTasksLocal(idsToDelete, false, false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  getTask: async function ({ id }) {
    const batch = await taskCRUD.getTasks({ ids: [id] });
    if (batch.isErr()) return err(batch.error);

    const { successes, errors } = batch.value;
    if (errors.length > 0) return err(errors[0]);

    return ok(successes[0]);
  },

  getTasks: async function ({ ids }) {
    assertDB(_db);
    const tasks: Task[] = [];
    const notFoundIds: string[] = [];

    try {
      for (const id of ids) {
        const task = await _db.get(TASK_TABLE_NAME, id);
        if (task) {
          const taskObj = task as Task;
          // Only return tasks owned by the current user
          if (await validateTaskOwnership(taskObj)) {
            tasks.push(taskObj);
          } else {
            notFoundIds.push(id); // Treat unauthorized access as "not found"
          }
        } else {
          notFoundIds.push(id);
        }
      }

      return okBatch(tasks, notFoundIds.map(id => new NotFoundError("failed to get task", id)));
    } catch (e) {
      return err(new IOError("Batch read", ids.join(', '), e));
    }
  },

  getAllUserTasks: async function ({ userId }) {
    assertDB(_db);
    // Require an active user and only allow reads for that user's data
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== userId) {
      return okBatch([] as Task[]);
    }
    const userTasks = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', userId);
    return okBatch(userTasks as Task[]);
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  updateTask: async function (update) {
    const batch = await taskCRUD.updateTasks({ updates: [update] });
    if (batch.isErr()) return err(batch.error);

    const { successes, errors } = batch.value;
    if (errors.length > 0) return err(errors[0]);

    return ok(successes[0]);
  },

  updateTasks: ({ updates }) => _updateTasksLocal(updates),
  handleUpdateTasksResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldState, error } = response.error;
      const user = await getCurrentUser();
      const hasSync = user ? userHasFeature(user, 'task-sync') : false;
      if (error.type === ErrorType.NotAuthorizedError && !hasSync) {
        // TODO:sync inform user of error (via popup?)
        Err.UNHANDLED(error);
      }
      new IOError('Remote updateTasks failed; reverting local', response.error).logError();
      // TODO This needs to perform the inverse relationship operations
      await _updateTasksLocal(oldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function ({ id, recursive }) {
    return await taskCRUD.deleteTasks({ ids: [id], recursive });
  },

  deleteTasks: ({ ids, recursive }) => _deleteTasksLocal(ids, recursive ?? false),
  handleDeleteTasksResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldState, error } = response.error;
      const user = await getCurrentUser();
      const hasSync = user ? userHasFeature(user, 'task-sync') : false;
      if (error.type === ErrorType.NotAuthorizedError && !hasSync) {
        console.warn('[Sync] deleteTasks unauthorized; user lacks task-sync. Keeping local deletions for', oldState.map(t => t.id));
        return;
      }
      new IOError('Remote deleteTasks failed; restoring local deletions', response.error).logError();
      await _createTasksLocal(oldState, false);
    }
  },

  changeOwnership: ({ oldUserID, newUserID }) => _changeOwnershipLocal(oldUserID, newUserID),
  handleChangeOwnershipResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldUserID, newUserID, error } = response.error;
      const user = await getCurrentUser();
      const hasSync = user ? userHasFeature(user, 'task-sync') : false;
      if (error.type === ErrorType.NotAuthorizedError && !hasSync) {
        console.warn('[Sync] changeOwnership unauthorized; user lacks task-sync. Keeping local ownership change', { oldUserID, newUserID });
        return;
      }
      new IOError('Remote changeOwnership failed; reverting local', response.error).logError();
      await _changeOwnershipLocal(newUserID, oldUserID, false);
    }
  },
}
async function _createTasksLocal(tasks: CreateTaskParams[], updateServer: boolean = true): Promise<BatchResult<Task, ArgumentError, InvalidStateError | NotAuthorizedError>> {
  if (tasks.length === 0) return okBatch([], []);

  assertDB(_db);
  const createdTasks: Task[] = [];
  const errors: ArgumentError[] = [];

  // Get current user to assign ownership
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return err(new InvalidStateError("Cannot create tasks without an authenticated user account"));
  }

  for (const taskDTO of tasks) {
    if (taskDTO.id) {
      const result = await taskCRUD.getTask({ id: taskDTO.id });
      if (result.isOk()) {
        errors.push(new ArgumentError(taskDTO, `Attempted to create a task with an id that already exists. Use update if you wish to overwrite.`));
        continue;
      }
    }

    // Ensure the task is owned by the current user
    const taskWithOwnership = { ...taskDTO, user_id: currentUser.id };
    const preparedTask = createTask(taskWithOwnership);
    preparedTask.created = new Date().toISOString();

    await _db.put(TASK_TABLE_NAME, preparedTask);

    createdTasks.push(preparedTask);
  }

  // Ensure inverse relations exist locally before notifying subscribers.
  // This makes descendant-scoped subscribers include newly created children immediately.
  const localRelUpdates = await getRelationshipUpdates(api, createdTasks.map(newTask => ({ oldTask: null, newTask })));
  if (localRelUpdates.length > 0) {
    // Local-only. We don't want the server updating with temp-ids
    await _updateTasksLocal(localRelUpdates, false);
  }

  // Update search index for newly created tasks
  if (_searchService) {
    createdTasks.forEach(task => _searchService!.indexTask(task));
  }

  await _emitChanges(createdTasks.map(newTask => ({ oldTask: null, newTask })) as TaskDelta[]);

  /* if (updateServer) {
      await queueTaskSyncCommand('createTasks', { createDetails: tasks }, { createdIds: createdTasks.map(t => t.id) }); */
  if (updateServer && _remoteTasks) {
    void _remoteTasks.createTasks({ createDetails: createdTasks })
      .then(async (response) => {
        if (response.isErr()) {
          const unauthorized = response.error.type === ErrorType.NotAuthorizedError;
          const idsToDelete = createdTasks.map(t => t.id);
          if (unauthorized) {
            await taskCRUD.handleCreateTasksResponse(
              err({ idsToDelete, error: new NotAuthorizedError('Unauthorized createTasks', idsToDelete) })
            );
          } else {
            new IOError('Remote createTasks failed; reverting local', response.error).logError();
            await _deleteTasksLocal(idsToDelete, false, false);
          }
        } else {
          await taskCRUD.handleCreateTasksResponse(ok(response.value));
        }
      })
      .catch(async (e) => {
        Err.UNHANDLED(e);
      });
  }

  return okBatch(createdTasks, errors);
};
async function _updateTasksLocal(updates: UpdateTaskParams[], updateServer: boolean = true) {
  if (updates.length === 0) return okBatch([], []);

  assertDB(_db);
  const updatedTasks: Map<Task, Task> = new Map();
  const errors: Err[] = [];

  for (const update of updates) {
    const { id, data: changes = {}, relations = [] } = update;
    const taskResult = await taskCRUD.getTask({ id });
    if (taskResult.isErr()) { errors.push(taskResult.error); continue; }
    const task = taskResult.value;

    // Validate user ownership before allowing update
    if (!(await validateTaskOwnership(task))) {
      errors.push(new NotFoundError(task.id, "Task (unauthorized)"));
      continue;
    }

    // Apply relationship changes
    let updatedChildren = new Set(task.children || []);
    let updatedParents = new Set(task.parents || []);

    for (const relation of relations) {
      switch (relation.operation) {
        case 'addChild':
          updatedChildren.add(relation.id);
          break;
        case 'removeChild':
          updatedChildren.delete(relation.id);
          break;
        case 'addParent':
          updatedParents.add(relation.id);
          break;
        case 'removeParent':
          updatedParents.delete(relation.id);
          break;
      }
    }

    const updated: Task = {
      ...(task as Task),
      ...(changes as Partial<Task>),
      children: Array.from(updatedChildren),
      parents: Array.from(updatedParents),
      last_edit: new Date().toISOString()
    };

    await _db.put(TASK_TABLE_NAME, updated);

    // We can use the updates id since id can't be changed via update
    updatedTasks.set(task, updated);
  }
  try {
    const relUpdates = await getRelationshipUpdates(api, Array.from(updatedTasks).map(([oldTask, newTask]) => ({ oldTask, newTask })));
    // TODO:?? I'm not sure if this updateServer should be propagated here, or intentionally `false`
    await _updateTasksLocal(relUpdates, updateServer);
  } catch (e) {
    console.error("Task relationship update failed:", updatedTasks);
  }

  // Update search index for updated tasks
  if (_searchService) {
    // TODO:optimization this should probably be removing old data as well...
    Array.from(updatedTasks.values()).forEach(task => _searchService!.indexTask(task));
  }
  /*   if (updateServer) {
      await queueTaskSyncCommand('updateTasks', { updates }, { oldState: Array.from(updatedTasks).map(([task]) => ({ updatedId: task.id, task })) });
   */
  // Notify subscribers immediately; remote handling will revert as needed
  const deltas: TaskDelta[] = Array.from(updatedTasks).map(([oldTask, newTask]) => ({ oldTask, newTask }));
  await _emitChanges(deltas);

  if (updateServer && _remoteTasks) {
    void _remoteTasks.updateTasks({ updates })
      .then(async (response) => {
        if (response.isErr()) {
          const oldState = Array.from(updatedTasks).map(([task]) => ({ updatedId: task.id, task }));
          const unauthorized = response.error.type === ErrorType.NotAuthorizedError;
          if (unauthorized) {
            await taskCRUD.handleUpdateTasksResponse(
              err({ oldState, error: new NotAuthorizedError('Unauthorized updateTasks', oldState) })
            );
          } else {
            new IOError('Remote updateTasks failed; reverting local', response.error).logError();
            await _updateTasksLocal(oldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
          }
        } else {
          const { successes } = response.value;
          const successIds = new Set((successes as Task[]).map(t => t.id));
          const failedOldState = Array.from(updatedTasks)
            .filter(([oldTask]) => !successIds.has(oldTask.id))
            .map(([oldTask]) => ({ updatedId: oldTask.id, task: oldTask }));
          if (failedOldState.length > 0) {
            new IOError('Remote updateTasks partially failed; reverting local for failed items', failedOldState).logError();
            await _updateTasksLocal(failedOldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
          }
        }
      })
      .catch(async (e) => {
        Err.UNHANDLED(e);
      });
  }

  return okBatch(updatedTasks.values().toArray(), errors);
};
async function _deleteTasksLocal(ids: string[], recursive: boolean, updateServer: boolean = true) {
  if (ids.length === 0) return ok();

  assertDB(_db);

  const deletedTasks: Task[] = [];
  const errors: (NotFoundError | NotAuthorizedError)[] = [];
  for (const id of ids) {
    const taskResult = await taskCRUD.getTask({ id });
    if (taskResult.isErr()) {
      errors.push(taskResult.error);
      continue;
    }
    const task = taskResult.value;

    // Validate user ownership before allowing deletion
    if (!(await validateTaskOwnership(task))) {
      errors.push(new NotAuthorizedError("User does not own task", task));
      continue;
    }

    if (recursive && task.children.length > 0) {
      // Recursively delete children first to avoid transient dangling refs
      await _deleteTasksLocal(task.children, recursive, false);
    }

    deletedTasks.push(task);
    await _db.delete(TASK_TABLE_NAME, task.id);

    // Remove from search index
    if (_searchService) {
      _searchService.removeTask(task.id);
    }

    // After removal, clean up relationships for parents/children that reference this id
    const relUpdates = await getRelationshipUpdates(api, { oldTask: task, newTask: null });
    await _updateTasksLocal(relUpdates, false);
  }

  // Notify subscribers
  const deleteDeltas: TaskDelta[] = deletedTasks.map(oldTask => ({ oldTask, newTask: null })) as TaskDelta[];
  await _emitChanges(deleteDeltas);

  /*   if (updateServer) {
      await queueTaskSyncCommand('deleteTasks', { deleteArgs }, { oldState: deletedTasks });
   */
  if (updateServer && _remoteTasks) {
    // Send server the IDs of tasks that were actually deleted (post-recursion)
    const idsToDelete = deletedTasks.map(task => task.id);
    void _remoteTasks.deleteTasks({ ids: idsToDelete })
      .then(async (response) => {
        if (response.isErr()) {
          const unauthorized = response.error.type === ErrorType.NotAuthorizedError;
          if (unauthorized) {
            await taskCRUD.handleDeleteTasksResponse(
              err({ oldState: deletedTasks, error: new NotAuthorizedError('Unauthorized deleteTasks', idsToDelete) })
            );
          } else {
            new IOError('Remote deleteTasks failed; restoring local deletions', response.error).logError();
            await _createTasksLocal(deletedTasks, false);
          }
        }
      })
      .catch(async (e) => {
        Err.UNHANDLED(e);
      });
  }
  if (errors.length > 0) {
    return err(new IOError("Batch delete", errors));
  }
  return ok();
};
async function _changeOwnershipLocal(oldUserID: string, newUserID: string, updateServer: boolean = true): Promise<BatchResult<Task>> {
  assertDB(_db);
  const originalTasks = await _db.getAllFromIndex('tasks', 'by-user', oldUserID);
  const convertedTasks = (originalTasks as Task[]).map(t => ({ ...t, user_id: newUserID } as Task));

  for (const task of convertedTasks) {
    await _db.put('tasks', task);
  }
  /*   if (updateServer) {
      await queueTaskSyncCommand('changeOwnership', { oldUserID, newUserID }, { oldUserID, newUserID });
   */
  if (updateServer && _remoteTasks) {
    void _remoteTasks.changeOwnership({ oldUserID, newUserID })
      .then(async (response) => {
        if (response.isErr()) {
          const unauthorized = response.error.type === ErrorType.NotAuthorizedError;
          if (unauthorized) {
            await taskCRUD.handleChangeOwnershipResponse(
              err({ oldUserID, newUserID, error: new NotAuthorizedError('Unauthorized changeOwnership', { oldUserID, newUserID } as any) })
            );
          } else {
            new IOError('Remote changeOwnership failed; reverting local', response.error).logError();
            await _changeOwnershipLocal(newUserID, oldUserID, false);
          }
        }
      })
      .catch(async (e) => {
        Err.UNHANDLED(e);
      });
  }

  return okBatch(convertedTasks);
}
//#endregion

const taskRelations: ITaskRelations = {
  getChildrenOf: async function ({ id }) {
    // First get the parent task to access its children array
    const parentResult = await taskCRUD.getTask({ id });
    if (parentResult.isErr()) {
      return err(parentResult.error);
    }
    const parentTask = parentResult.value;

    if (parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specific child tasks
    const childPromises = parentTask.children.map(childId => taskCRUD.getTask({ id: childId }));
    const childResults = await Promise.all(childPromises);

    // Filter out any failed reads and extract successful tasks
    const children = childResults
      .filter(result => result.isOk())
      .map(result => result.value as Task);

    return ok(children);
  },
  getParentsOf: async function ({ id }) {

    // Convert id to task object
    const childTaskResult = await taskCRUD.getTask({ id });
    if (childTaskResult.isErr()) {
      return err(childTaskResult.error);
    }
    const childTask = childTaskResult.value;

    // Get the parents
    if (childTask.parents.length > 0) {
      const parentsBatch = await taskCRUD.getTasks({ ids: childTask.parents });
      if (parentsBatch.isErr()) return err(parentsBatch.error);
      else {
        const { successes, errors } = parentsBatch.value;
        errors.forEach(e => e.logError());
        return ok(successes);
      }

    } else {
      return ok([]);
    }
  },

  getRootTasks: async function () {
    assertDB(_db);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return ok([]); // No authenticated user, return empty array
    }

    const allTasks = await _db.getAll(TASK_TABLE_NAME);
    const rootTasks = (allTasks as Task[]).filter(task =>
      task.parents.length === 0 && task.user_id === currentUser.id);
    return ok(rootTasks);
  }
}

type UserSubscription = {
  kind: 'user-tasks';
  userId: string;
  onInitialize: (tasks: Task[]) => void;
  onChange: (changes: TaskDelta[]) => void;
};
type ScopedSubscription = {
  kind: 'task-ids';
  ids: string[];
  ancestorDepth: number;
  descendantDepth: number;
  includedIds?: Set<string>;
  onInitialize: (tasks: Task[]) => void;
  onChange: (changes: TaskDelta[]) => void;
};
type Subscription = UserSubscription | ScopedSubscription;

let _subscriptions: Subscription[] = [];
type IncludedSet = Set<string>;
async function _computeIncludedIds(seedIds: string[], ancestorDepth: number, descendantDepth: number): Promise<IncludedSet> {
  const included: IncludedSet = new Set(seedIds);
  const get = async (id: string) => {
    const res = await taskCRUD.getTask({ id });
    return res.isOk() ? res.value : null;
  };
  // Ancestors (parents)
  let up = [...seedIds];
  for (let d = 0; d < ancestorDepth && up.length; d++) {
    const next: string[] = [];
    for (const id of up) {
      const t = await get(id); if (!t) continue;
      for (const pid of t.parents ?? []) if (!included.has(pid)) { included.add(pid); next.push(pid); }
    }
    up = next;
  }
  // Descendants (children)
  let down = [...seedIds];
  for (let d = 0; d < descendantDepth && down.length; d++) {
    const next: string[] = [];
    for (const id of down) {
      const t = await get(id); if (!t) continue;
      for (const cid of t.children ?? []) if (!included.has(cid)) { included.add(cid); next.push(cid); }
    }
    down = next;
  }
  return included;
}

async function _getAllTasksForCurrentUser(): Promise<Task[]> {
  assertDB(_db);
  const all = await _db.getAll(TASK_TABLE_NAME);
  const mine = await validateTasksOwnership(all as Task[]);
  return mine;
}

async function _emitChanges(deltas: TaskDelta[]) {
  if (deltas.length === 0) return;
  for (const sub of _subscriptions) {
    if (sub.kind === 'user-tasks') {
      const filtered = deltas.filter(d => (d.newTask?.user_id ?? d.oldTask?.user_id) === sub.userId);
      if (filtered.length > 0) sub.onChange(filtered);
    } else {
      // Recompute included set per event to reflect latest graph state
      const included = await _computeIncludedIds(sub.ids, sub.ancestorDepth, sub.descendantDepth);
      sub.includedIds = included;
      const filtered = deltas.filter(d => {
        const nid = d.newTask?.id;
        const oid = d.oldTask?.id;
        return (nid && included.has(nid)) || (oid && included.has(oid));
      });
      if (filtered.length > 0) sub.onChange(filtered);
    }
  }
}

const advancedFeatures: ITaskAdvancedFeatures = {
  getTodaysTasks: async function () {
    assertDB(_db);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return ok([]); // No authenticated user, return empty array
    }

    const allTasks = await _db.getAll(TASK_TABLE_NAME);
    const userTasks = (allTasks as Task[]).filter(t => t.user_id === currentUser.id);
    const today = new Date().toISOString().split('T')[0];
    const todays = userTasks.filter(t => t.todays_task && t.todays_task.startsWith(today));
    return ok(todays);
  },

  getPrioritizedTasks: async function (limit: number) {
    assertDB(_db);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return ok([]); // No authenticated user, return empty array
    }

    let taskArray: Task[] = (await _db.getAll(TASK_TABLE_NAME) as Task[])
      .filter(t => t.user_id === currentUser.id);

    const roots: Task[] = taskArray.filter(t => t.parents.length === 0);
    const tasksMap: Map<string, Task> = new Map(taskArray.map(t => [t.id, t] as [string, Task]));

    const sorter = (a: Task | undefined, b: Task | undefined) => {
      if (!a) return -1;
      else if (!b) return 1;
      else return (b.priority ?? 0) - (a.priority ?? 0)
    };

    let todoList: Set<Task> = new Set();

    const inOrderTraversalAssignment = (task: Task) => {
      if (todoList.size === limit/*  || task.tags?.includes('disabled') */)
        return; // stop searching once all tasks are acquired

      // TODO this lil check right here may not be ideal... user testing will tell
      if (task.children.length === 0) { // is leaf node
        if (!isTaskCompleted(task)) {// and it's not already completed
          todoList.add(task); // add to todolist
        }
      }
      else { // continue for all children, starting with highest priority
        const children: (Task | undefined)[] = task.children.map(child => tasksMap.get(child)).sort(sorter)
        for (const child of children) {
          if (!child) continue;

          if (!isTaskCompleted(child)) {
            inOrderTraversalAssignment(child);
          }
        }

        if (children.every(c => !c || isTaskCompleted(c)) && !isTaskCompleted(task)) {
          todoList.add(task);
        }
      }
    }

    roots.sort(sorter);
    for (let i = 0; i < roots.length; i++) {
      if (todoList.size === limit)
        return ok(Array.from(todoList));

      const root = roots[i];
      inOrderTraversalAssignment(root);
    }

    return ok(Array.from(todoList));
  },

  searchTasks: async function (searchTerm) {
    if (!_searchService) {
      return [];
    }
    return _searchService.searchTasks(searchTerm);
  },
  subscribeTasks: function (params: any): () => void {
    const isUserSub = 'userId' in params;

    if (isUserSub) {
      const sub: UserSubscription = {
        kind: 'user-tasks',
        userId: params.userId,
        onInitialize: params.onInitialize,
        onChange: params.onChange,
      };
      _subscriptions.push(sub);
      // Initialize
      _getAllTasksForCurrentUser().then(tasks => {
        const init = tasks.filter(t => t.user_id === sub.userId);
        sub.onInitialize(init);
      });
      return () => {
        _subscriptions = _subscriptions.filter(s => s !== sub);
      };
    } else {
      const sub: ScopedSubscription = {
        kind: 'task-ids',
        ids: params.ids,
        ancestorDepth: params.ancestorDepth,
        descendantDepth: params.descendantDepth,
        includedIds: undefined,
        onInitialize: params.onInitialize,
        onChange: params.onChange,
      };
      _subscriptions.push(sub);
      // Initialize
      (async () => {
        const included = await _computeIncludedIds(sub.ids, sub.ancestorDepth, sub.descendantDepth);
        sub.includedIds = included;
        const batch = await taskCRUD.getTasks({ ids: Array.from(included) });
        if (batch.isOk()) {
          const { successes, errors } = batch.value;
          errors.forEach(e => e.logError());
          sub.onInitialize(successes);
        } else {
          sub.onInitialize([]);
        }
      })();
      return () => {
        _subscriptions = _subscriptions.filter(s => s !== sub);
      };
    }
  }
}

const dataExporter: ITaskExporter = {
  exportData: async function ({ simplify }) {
    assertDB(_db);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      throw new InvalidStateError("Cannot export data without an authenticated user");
    }

    // Only export tasks owned by the current user
    const allTasks = await _db.getAll(TASK_TABLE_NAME);
    const taskData = (allTasks as Task[]).filter(task => task.user_id === currentUser.id);
    const nameConflicts = new Set(taskData.filter(task => !taskData.find(other => task.title == other.title)).map(t => t.title));

    // 1. Create a new zip
    const zip = new JSZip();

    // 2. Add files
    for (const task of taskData) {
      // TODO replace with task.filepath
      let filename;
      if (nameConflicts.has(task.title))
        filename = `${task.title} (${task.id.substring(0, 4)}).md`
      else
        filename = `${task.title}.md`

      zip.file(filename, toMarkdown(task));
    }

    // 3. Generate the zip and trigger download
    zip.generateAsync({ type: 'blob' }).then((content) => {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wayfinder-export.zip';
      a.click();
      URL.revokeObjectURL(url);
    });
  },

  importData: function ({ data }) {
    Err.throw(new NotImplementedError('BrowserTaskProvider.importData'));
  }
}


let _db: LocalDB | null;
let _searchService: TaskSearchService | null = null;
let _remoteTasks: ITasks | null = null;
let _unsubscribeRemoteTasks: (() => void) | null = null;

// Module-load hydration: initialize DB, search index, and remote subscription
(async () => {
  try {
    _db = await dbPromise;

    // Initialize search service
    _searchService = new TaskSearchService();

    // Reindex search for current user
    const currentUser = await getCurrentUser();
    if (currentUser) {
      const existingTasksResult = await taskCRUD.getAllUserTasks({ userId: currentUser.id });
      if (existingTasksResult.isOk()) {
        const { successes, errors } = existingTasksResult.value;
        errors.forEach(e => e.logError());
        _searchService.reindexTasks(successes);
      }
    }

    // Subscribe to remote tasks availability store
    if (!_unsubscribeRemoteTasks) {
      _unsubscribeRemoteTasks = remoteTasksStore.subscribe(async (rt) => {
        const previous = _remoteTasks;
        _remoteTasks = rt;
        if (!previous && rt) {
          // Remote just became available; hydrate for current user if present
          const user = await getCurrentUser();
          if (user) {
            await _hydrateForUser(user);
          }
        }
      });
    }
  } catch {
    // remain usable offline; methods will assertDB as needed
  }
})();

async function _hydrateForUser(user: User): Promise<void> {
  assertDB(_db);
  if (!_remoteTasks) return; // No remote available; nothing to hydrate

  try {
    const remoteBatch = await _remoteTasks.getAllUserTasks({ userId: user.id });
    if (remoteBatch.isOk()) {
      const { successes: remoteList, errors } = remoteBatch.value;
      errors.forEach(e => e.logError());
      const localList = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', user.id) as Task[];
      const localById = new Map(localList.map(t => [t.id, t] as [string, Task]));

      let changed = false;
      for (const rt of remoteList) {
        const lt = localById.get(rt.id);
        const rtEdit = rt.last_edit ? new Date(rt.last_edit).getTime() : 0;
        const ltEdit = lt?.last_edit ? new Date(lt.last_edit).getTime() : 0;
        if (!lt || rtEdit > ltEdit) {
          await _db.put(TASK_TABLE_NAME, rt);
          changed = true;
        }
      }

      if (changed && _searchService) {
        const updatedUserTasks = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', user.id) as Task[];
        _searchService.reindexTasks(updatedUserTasks);
      }
    }
  } catch (e) {
    // Non-fatal: remain usable offline
  }
}

const api: ITaskCoreLocal & ITaskRelations & ITaskCoreResponseHandler & ITaskAdvancedFeatures & ITaskExporter = { ...taskCRUD, ...taskRelations, ...advancedFeatures, ...dataExporter };

// Public utility surface (mirrors auth pattern): usable without calling get()
export const browserTasksAPI: ILocalTasks = {
  ...api,
  hydrateForUser: async ({ user }) => { await _hydrateForUser(user); },
};

// Contextual store: all tasks for a given userId (does not load all app tasks)
export function userTasksStore({ userId }: { userId: string }): Readable<Task[]> {
  return readable<Task[]>([], (set) => {
    // Initialize from provider subscription (pushes initial slice)
    const unsubscribe = api.subscribeTasks({
      userId,
      onInitialize: (tasks: Task[]) => set(tasks),
      onChange: async () => {
        try {
          assertDB(_db);
          const list = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', userId) as Task[];
          set(list);
        } catch {
          // ignore transient failures; store remains last-known-good
        }
      },
    });
    return () => unsubscribe();
  });
}

// Contextual store: scoped to ids with ancestor/descendant depth
export function taskScopeStore(params: { ids: string[]; ancestorDepth: number; descendantDepth: number; }): Readable<Task[]> {
  const { ids, ancestorDepth, descendantDepth } = params;
  return readable<Task[]>([], (set) => {
    const unsubscribe = api.subscribeTasks({
      ids,
      ancestorDepth,
      descendantDepth,
      onInitialize: (tasks: Task[]) => set(tasks),
      onChange: async () => {
        try {
          const tasks = await _getAllTasksForCurrentUser();
          const included = await _computeIncludedIds(ids, ancestorDepth, descendantDepth);
          set(tasks.filter(t => included.has(t.id)));
        } catch {
          // ignore transient failures; store remains last-known-good
        }
      },
    });
    return () => unsubscribe();
  });
}

 

//#region Utilities

function assertDB(db: LocalDB | null): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError("Attempted to use BrowserTaskProvider without a db connection."));
}

async function getCurrentUser(): Promise<User | null> {
  assertDB(_db);
  const activeUserId = await _db.get(APP_TABLE_NAME, ACTIVEUSER_NAME) as string | undefined;
  if (activeUserId) {
    const user = await _db.get(AUTH_TABLE_NAME, activeUserId);
    return user ?? null;
  }
  return null;
}

async function validateTaskOwnership(task: Task): Promise<boolean> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return false; // No authenticated user
  }
  return task.user_id === currentUser.id;
}

async function validateTasksOwnership(tasks: Task[]): Promise<Task[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return []; // No authenticated user
  }
  return tasks.filter(task => task.user_id === currentUser.id);
}

/** This function manages writing the markdown file, then updating the index */
// async function writeTaskToDB(task: Task): Promise<Result<void, IOError>> {
//   assertDB(db);
//   if (!task.filepath) task.filepath = task.id + ".md";
//   const md = Task.toMarkdown(task);

//   try {
//     // Create the .md file
//     await db.put('files', { filepath: task.filepath, content: md });
//   } catch (e) {
//     return err(new IOError(`Failed to write ${task.filepath}`, e, md));
//   }

//   // Update the DB with the new file's data
//   const updateRes = await updateIndexFromFile(task.filepath);
//   if (updateRes.isErr()) {
//     return err(updateRes.error);
//   }
//   return ok();
// }

/**
 * @error {@link NotFoundError} if the file doesn't exist in the IndexedDB
 * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
 */
// async function updateIndexFromFile(filepath: string): Promise<Result<void, NotFoundError | ParseError>> {
//   assertDB(db);
//   const file = await db.get('files', filepath);

//   if (!file) {
//     return err(new NotFoundError(filepath, "File"));
//   }

//   return Task.fromMarkdown(file.content, filepath).match(
//     async task => {
//       await db!.put(TASK_STORE_NAME, task);
//       return ok();
//     },
//     error => {
//       return err(error);
//     });
// }
//#endregion

async function _remapLocalIdsAndRelationships(updatedIds: Map<string, string>): Promise<Task[]> {
  assertDB(_db);
  if (updatedIds.size === 0) return [];

  // Load all affected tasks
  const oldIds = Array.from(updatedIds.keys());
  const localsBatch = await taskCRUD.getTasks({ ids: oldIds });
  const locals = localsBatch.isOk() ? localsBatch.value.successes : [];

  const remapped: Task[] = [];
  // 1) Rewrite each task with the new ID and write it as a new record
  for (const local of locals as Task[]) {
    const newId = updatedIds.get(local.id)!;
    const updated: Task = { ...local, id: newId, last_edit: new Date().toISOString() };
    await _db.put(TASK_TABLE_NAME, updated);
    remapped.push(updated);
  }
  // 2) Delete the old ID records
  for (const local of locals as Task[]) {
    await _db.delete(TASK_TABLE_NAME, local.id);
  }
  // 3) Update any references in other tasks' parents/children to point to the new IDs
  //    We do this via relationship updates so it stays consistent with existing flow
  const idMap = updatedIds;
  // TODO:optimization this is an inefficient solution, when we already have relationship data in the changed tasks
  const allUserTasks = await _getAllTasksForCurrentUser();
  const refUpdates: UpdateTaskParams[] = [];
  for (const task of allUserTasks) {
    let parents = task.parents ?? [];
    let children = task.children ?? [];
    const newParents = parents.map(p => idMap.get(p) ?? p);
    const newChildren = children.map(c => idMap.get(c) ?? c);

    // Compute relation operations instead of raw array replacement
    const relations: { id: string, operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[] = [];

    // Parent changes
    const addedParents = newParents.filter(p => !parents.includes(p));
    const removedParents = parents.filter(p => !newParents.includes(p));
    addedParents.forEach(p => relations.push({ id: p, operation: 'addParent' }));
    removedParents.forEach(p => relations.push({ id: p, operation: 'removeParent' }));

    // Child changes
    const addedChildren = newChildren.filter(c => !children.includes(c));
    const removedChildren = children.filter(c => !newChildren.includes(c));
    addedChildren.forEach(c => relations.push({ id: c, operation: 'addChild' }));
    removedChildren.forEach(c => relations.push({ id: c, operation: 'removeChild' }));

    if (relations.length > 0) {
      refUpdates.push({ id: task.id, data: {}, relations });
    }
  }
  if (refUpdates.length > 0) {
    await _updateTasksLocal(refUpdates, false);
  }
  // 4) Handle inverse relationship updates for newly remapped tasks
  //    This ensures that when remapped tasks declare parents/children, 
  //    those parent/child tasks also reference the remapped tasks
  const postRelUpdates = await getRelationshipUpdates(api, remapped.map(newTask => ({ oldTask: null, newTask })));
  if (postRelUpdates.length > 0) {
    // Local-only: Server already handled relationships with real IDs during creation
    await _updateTasksLocal(postRelUpdates, false);
  }

  // 5) Emit changes for remapped tasks: delete temps, add authoritative
  const deleteDeltas: TaskDelta[] = (locals as Task[]).map(oldTask => ({ oldTask, newTask: null }));
  const addDeltas: TaskDelta[] = remapped.map(newTask => ({ oldTask: null, newTask }));
  await _emitChanges([...deleteDeltas, ...addDeltas]);
  return remapped;
}