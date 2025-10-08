import { NotFoundError, Err, ParseError, IOError, InvalidStateError, ArgumentError, NotAuthorizedError } from '$domain/errors';
import { err, ok, type Result } from '$domain/result';
import { type ITasksLocal, type Task, type CreateTaskParams, type UpdateTaskParams, type TaskDelta, isTaskCompleted, createTask, type ITasks } from '$domain/models/task';
import { getRelationshipUpdates, tasksAPI } from '.';
import { TaskSearchService } from './TaskSearchService';
import { dbPromise, type LocalDB } from '../localDB';
import { remoteTasks as remoteTasksStore } from '$lib/stores/remoteTasks';
import { get, readable, type Readable } from 'svelte/store';
import { authState } from '../Auth';
import { v4 } from 'uuid';
import { TASK_TABLE_NAME } from '../DBConstants';
import { userHasFeature, type UserFeature } from '$domain/models/user';
// import { queueTaskSyncCommand } from './types';

//#region API Definition

const api: ITasksLocal = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function ({ createDetail: task }) {
    const [newTask, error] = await _createTasksLocal([task]);
    if (error) return err(error);

    return ok(newTask[0].id);
  },
  /**
  * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
  * @error {@link IOError} if the IndexedDB.put() attempt fails
  */
  createTasks: async ({ createDetails }) => {
    const [newTasks, error] = await _createTasksLocal(createDetails);
    if (error) return err(error);

    return ok(newTasks.map(t => t.id));
  },
  handleCreateTasksResponse: async function ([success, failure]) {
    if (!failure) {
      const { updatedIds, affectedTasks } = success;
      await _remapLocalIdsAndRelationships(updatedIds, affectedTasks);
    } else {
      const { idsToDelete, error } = failure;
      if (error instanceof NotAuthorizedError && !currentUserHasFeature('task-sync')) {
        // We don't want to revert local tasks if the user isn't paying for sync
        // otherwise they won't be able to use the app at all
        return;
      }

      // TODO:sync Unknown errors should not destroy the local version, but queue for a retry...
      // Don't forget to log for the developer's sake, however
      console.error(new IOError('[SERVER/SYNC] Remote createTasks failed; reverting local', error));
      await _deleteTasksLocal(idsToDelete, false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  getTask: async function ({ id }) {
    const [tasks, error] = await api.getTasks({ ids: [id] });
    if (error) return err(error);

    return ok(tasks[0]);
  },
  getTasks: async function ({ ids }) {
    assertDB(_db);
    const tasks: Task[] = [];

    for (const id of ids) {
      const task = await _db.get(TASK_TABLE_NAME, id);
      if (task) {
        const taskObj = task as Task;
        // Only return tasks owned by the current user
        if (await validateTaskOwnership(taskObj)) {
          tasks.push(taskObj);
        } else {
          return err(new NotFoundError("User not authorized to access task", id));
        }
      } else {
        return err(new NotFoundError("failed to get task", id));
      }
    }

    return ok(tasks);
  },
  getAllUserTasks: async function ({ userId }) {
    assertDB(_db);
    // Require an active user and only allow reads for that user's data
    // TODO:debt Should we be subscribing to the store, rather than using get(authState) everywhere?
    const auth = get(authState);
    if (auth.status === 'signed-in' && auth.user.id !== userId) {
      return ok([] as Task[]);
    }
    const userTasks = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', userId);
    return ok(userTasks as Task[]);
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  updateTask: async function (update) {
    const [tasks, error] = await api.updateTasks({ updates: [update] });
    if (error) return err(error);

    return ok(tasks[0]);
  },
  updateTasks: ({ updates }) => _updateTasksLocal(updates),
  handleUpdateTasksResponse: async function ([success, failure]) {
    if (failure) {
      assertDB(_db);
      const { oldState, error } = failure;

      if (error instanceof NotAuthorizedError && !currentUserHasFeature('task-sync')) {
        // We don't want to revert local tasks if the user isn't paying for sync
        // otherwise they won't be able to use the app at all
        return;
      }

      console.error(new IOError('[SERVER/SYNC] Remote updateTasks failed; reverting local', error));
      await _updateTasksLocal(oldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function ({ id }) {
    return await api.deleteTasks({ ids: [id] });
  },
  deleteTasks: ({ ids }) => _deleteTasksLocal(ids ?? false),
  handleDeleteTasksResponse: async function ([success, failure]) {
    if (failure) {
      assertDB(_db);
      const { oldState, error } = failure;
      if (error instanceof NotAuthorizedError && !currentUserHasFeature('task-sync')) {
        // We don't want to revert local tasks if the user isn't paying for sync
        // otherwise they won't be able to use the app at all
        return;
      }
      console.error(new IOError('[SERVER/SYNC] Remote deleteTasks failed; restoring local deletions', failure));
      await _createTasksLocal(oldState, false);
    }
  },

  handleMigrateResponse(response) {
    Err.NotImplemented("BrowserTaskProvider.handleMigrateResponse");
  },

  getChildrenOf: async function ({ id }) {
    // First get the parent task to access its children array
    const [parentTask, getPErr] = await api.getTask({ id });
    if (getPErr) {
      return err(getPErr);
    }

    if (parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specific child tasks
    const [children, getCErr] = await api.getTasks({ ids: parentTask.children });
    if (getCErr) {
      return err(getCErr);
    }

    return ok(children);
  },
  getParentsOf: async function ({ id }) {
    // Convert id to task object
    const [childTask, getCErr] = await api.getTask({ id });
    if (getCErr) {
      return err(getCErr);
    }

    // Get the parents
    if (childTask.parents.length > 0) {
      const [parents, getPErr] = await api.getTasks({ ids: childTask.parents });
      if (getPErr) return err(getPErr);
      else {
        return ok(parents);
      }
    } else {
      return ok([]);
    }
  },
  getRootTasks: async function () {
    assertDB(_db);
    const auth = get(authState);
    if (auth.status !== 'signed-in') {
      return ok([]); // No authenticated user, return empty array
    }

    const allTasks = await _db.getAll(TASK_TABLE_NAME);
    const rootTasks = (allTasks as Task[]).filter(task =>
      task.parents.length === 0 && task.userAuthId === auth.user.id);
    return ok(rootTasks);
  },

  getTodaysTasks: async function () {
    assertDB(_db);
    const auth = get(authState);
    if (auth.status !== 'signed-in') {
      return ok([]); // No authenticated user, return empty array
    }

    const allTasks = await _db.getAll(TASK_TABLE_NAME);
    const userTasks = (allTasks as Task[]).filter(t => t.userAuthId === auth.user.id);
    const today = new Date().toISOString().split('T')[0];
    const todays = userTasks.filter(t => t.todaysTask && t.todaysTask.toISOString().startsWith(today));
    return ok(todays);
  },
  getPrioritizedTasks: async function (limit: number) {
    assertDB(_db);
    const auth = get(authState);
    if (auth.status !== 'signed-in') {
      return ok([]); // No authenticated user, return empty array
    }

    let taskArray: Task[] = (await _db.getAll(TASK_TABLE_NAME) as Task[])
      .filter(t => t.userAuthId === auth.user.id);

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
        const init = tasks.filter(t => t.userAuthId === sub.userId);
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
        const [tasks, error] = await api.getTasks({ ids: Array.from(included) });
        if (error) { Err.UNHANDLED(error); }

        if (tasks) {
          sub.onInitialize(tasks);
        } else {
          sub.onInitialize([]);
        }
      })();
      return () => {
        _subscriptions = _subscriptions.filter(s => s !== sub);
      };
    }
  },

  exportData: async function () {
    assertDB(_db);
    const auth = get(authState);
    if (auth.status !== 'signed-in') {
      throw new InvalidStateError("Cannot export data without an authenticated user");
    }

    // Only export tasks owned by the current user
    const userTasks = await _db.getAllFromIndex('tasks', "by-user", auth.user.id);

    const data: ExportData = { version: 1, data: userTasks };
    return JSON.stringify(data, undefined, 2);
  },
  importData: async function ({ data, mode = "add" }) {
    const parsed = JSON.parse(data) as ExportData;
    switch (parsed.version) {
      case 1:
      default:
        const auth = get(authState);
        if (auth.status !== 'signed-in') {
          throw new InvalidStateError("Cannot import data without an authenticated user");
        }

        const incoming: Task[] = parsed.data;
        assertDB(_db);
        switch (mode) {
          case 'replace':
            // Delete all data, the fall through to the add logic
            const [userTasks, error] = await tasksAPI.getAllUserTasks({ userId: auth.user.id });
            if (error) {
              Err.UNHANDLED(error);
            }

            const allIds = userTasks.map(t => t.id);
            await tasksAPI.deleteTasks({ ids: allIds });

          case "add":
          default:
            // Import all as new data
            // Generate and remap all relationship ids
            const oldIdSet = new Set(incoming.map(t => t.id));
            const idMap = new Map<string, string>();
            incoming.forEach(t => idMap.set(t.id, v4()));

            const remap = (ids?: string[]) => (ids ?? [])
              .filter(id => oldIdSet.has(id))
              .map(id => idMap.get(id) as string);

            const createDetails: CreateTaskParams[] = incoming.map(t => ({
              ...t,
              id: idMap.get(t.id) as string,
              parents: remap(t.parents),
              children: remap(t.children),
            }));

            const [newTasks, createError] = await _createTasksLocal(createDetails, true);
            if (createError) {
              Err.UNHANDLED(createError);
            }

            return newTasks.length;
        }
    }
  },

  hydrateForUser: async function ({ user }) {
    assertDB(_db);
    if (!_remoteTasks) return; // No remote available; nothing to hydrate

    try {
      const [userTasks, error] = await _remoteTasks.getAllUserTasks({ userId: user.id });
      if (error) { Err.UNHANDLED(error); }

      if (userTasks) {
        const localList = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', user.id) as Task[];
        const localById = new Map(localList.map(t => [t.id, t] as [string, Task]));

        let changed = false;
        for (const rt of userTasks) {
          const lt = localById.get(rt.id);
          const rtEdit = rt.lastEdit ? new Date(rt.lastEdit).getTime() : 0;
          const ltEdit = lt?.lastEdit ? new Date(lt.lastEdit).getTime() : 0;
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
}
type ExportData = { version: number, data: any }
export default api;

async function _createTasksLocal(tasks: CreateTaskParams[], updateServer: boolean = true): Promise<Result<Task[], ArgumentError | InvalidStateError | NotAuthorizedError>> {
  if (tasks.length === 0) return ok([]);

  assertDB(_db);
  const createdTasks: Task[] = [];

  // Get current user to assign ownership
  const auth = get(authState);
  if (auth.status !== 'signed-in') {
    return err(new InvalidStateError("[BROWSER] Cannot create tasks without an authenticated user account"));
  }

  for (const taskDTO of tasks) {
    // Check that we won't overwrite existing tasks
    if (taskDTO.id) {
      const [task, error] = await api.getTask({ id: taskDTO.id });
      if (task) {
        return err(new ArgumentError(`[BROWSER] Attempted to create a task with an id that already exists. Use update if you wish to overwrite.`, taskDTO));
      }
    }

    // Ensure the task is owned by the current user
    const taskWithOwnership = { ...taskDTO, user_id: auth.user.id };
    const preparedTask = createTask(taskWithOwnership);
    // preparedTask.created = new Date().toISOString();

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

  if (updateServer && _remoteTasks) {
    void _remoteTasks.createTasks({ createDetails: createdTasks })
      .then(async ([tasks, error]) => {
        if (error) {
          const idsToDelete = createdTasks.map(t => t.id);
          if (error instanceof NotAuthorizedError) {
            await api.handleCreateTasksResponse(
              err({ idsToDelete, error: new NotAuthorizedError('Unauthorized createTasks', idsToDelete) })
            );
          } else {
            console.error(new IOError('[SERVER/SYNC] Remote createTasks failed; reverting local', error));
            await _deleteTasksLocal(idsToDelete, false);
          }
        } else {
          await api.handleCreateTasksResponse(ok(tasks));
        }
      })
  }

  return ok(createdTasks);
}

// TODO:critical Add infinite recursion guards
async function _updateTasksLocal(updates: UpdateTaskParams[], updateServer: boolean = true) {
  if (updates.length === 0) return ok([]);

  assertDB(_db);
  const updatedTasks: Map<Task, Task> = new Map();

  for (const update of updates) {
    const { id, data: changes = {}, relations = [] } = update;
    const [task, error] = await api.getTask({ id });
    if (error) { return err(error); }

    // Validate user ownership before allowing update
    if (!(await validateTaskOwnership(task))) {
      return err(new NotFoundError("Task (unauthorized)", task.id));
    }

    // Apply relationship changes
    let updatedChildren = new Set(changes.children || task.children || []);
    let updatedParents = new Set(changes.parents || task.parents || []);

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
      children: Array.from(updatedChildren) as string[],
      parents: Array.from(updatedParents) as string[],
      lastEdit: new Date()
    };

    await _db.put(TASK_TABLE_NAME, updated);

    // We can use the updates id since id can't be changed via update
    updatedTasks.set(task, updated);
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
      .then(async ([tasks, error]) => {
        if (error) {
          const oldState = Array.from(updatedTasks).map(([task]) => ({ updatedId: task.id, task }));
          const unauthorized = error instanceof NotAuthorizedError;
          if (unauthorized) {
            await api.handleUpdateTasksResponse(
              err({ oldState, error: new NotAuthorizedError('Unauthorized updateTasks', oldState) })
            );
          } else {
            console.error(new IOError('Remote updateTasks failed; reverting local', error));
            await _updateTasksLocal(oldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
          }
        } else {
          const successIds = new Set((tasks).map(t => t.id));
          const failedOldState = Array.from(updatedTasks)
            .filter(([oldTask]) => !successIds.has(oldTask.id))
            .map(([oldTask]) => ({ updatedId: oldTask.id, task: oldTask }));
          if (failedOldState.length > 0) {
            console.error(new IOError('Remote updateTasks partially failed; reverting local for failed items', failedOldState));
            await _updateTasksLocal(failedOldState.map(t => ({ id: t.updatedId, data: t.task, relations: [] })), false);
          }
        }
      })
      .catch(async (e) => {
        Err.UNHANDLED(e);
      });
  }

  return ok(updatedTasks.values().toArray());
};
async function _deleteTasksLocal(ids: string[], updateServer: boolean = true) {
  if (ids.length === 0) return ok(undefined);

  assertDB(_db);

  const deletedTasks: Task[] = [];
  const errors: (NotFoundError | NotAuthorizedError)[] = [];
  for (const id of ids) {
    const [task, error] = await api.getTask({ id });
    if (error) {
      return err(error);
    }

    // Validate user ownership before allowing deletion
    if (!(await validateTaskOwnership(task))) {
      errors.push(new NotAuthorizedError("User does not own task", task));
      continue;
    }

    /*     if (recursive && task.children.length > 0) {
          // TODO:critical Add infinite recursion guards
          // Recursively delete children first to avoid transient dangling refs
          await _deleteTasksLocal(task.children, recursive, false);
        } */

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
      .then(async ([_, error]) => {
        if (error) {
          const unauthorized = error instanceof NotAuthorizedError;
          if (unauthorized) {
            await api.handleDeleteTasksResponse(
              err({ oldState: deletedTasks, error: new NotAuthorizedError('Unauthorized deleteTasks', idsToDelete) })
            );
          } else {
            console.error(new IOError('Remote deleteTasks failed; restoring local deletions', error));
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
  return ok(undefined);
};

//#endregion


//#region Subscription Implementation

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
    const [task, error] = await api.getTask({ id });
    if (error) { Err.UNHANDLED(error); }
    return task;
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
      const filtered = deltas.filter(d => (d.newTask?.userAuthId ?? d.oldTask?.userAuthId) === sub.userId);
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

//#endregion


//#region Utilities

function currentUserHasFeature(feature: UserFeature): boolean {
  const auth = get(authState);
  if (auth.status !== 'signed-in') {
    return false;
  }
  return userHasFeature(auth.user, feature);
}

function assertDB(db: LocalDB | null): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError("Attempted to use BrowserTaskProvider without a db connection."));
}

async function validateTaskOwnership(task: Task): Promise<boolean> {
  // TODO:debt/performance This is incredibly inefficient since this path is called quite often.
  // prefer module-level auth value.
  const auth = get(authState);
  if (auth.status !== 'signed-in') {
    return false; // No authenticated user
  }
  return task.userAuthId === auth.user.id;
}

async function validateTasksOwnership(tasks: Task[]): Promise<Task[]> {
  const auth = get(authState);
  if (auth.status !== 'signed-in') {
    return []; // No authenticated user
  }
  return tasks.filter(task => task.userAuthId === auth.user.id);
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

async function _remapLocalIdsAndRelationships(updatedIds: Map<string, string>, affected: Task[] = []) {
  assertDB(_db);
  if (updatedIds.size === 0) return [];

  // 1) Collect and delete old temp ids
  const oldIds = Array.from(updatedIds.keys());
  const oldTasks: Task[] = [];
  for (const id of oldIds) {
    const t = await _db.get(TASK_TABLE_NAME, id) as Task | undefined;
    if (t) oldTasks.push(t);
  }
  for (const id of oldIds) {
    await _db.delete(TASK_TABLE_NAME, id);
  }

  // 2) Upsert authoritative affected tasks (includes newly created) and build deltas
  const affectedDeltas: TaskDelta[] = [];
  for (const t of affected) {
    const prev = await _db.get(TASK_TABLE_NAME, t.id) as Task | undefined;
    await _db.put(TASK_TABLE_NAME, t);
    if (_searchService) _searchService.indexTask(t);
    affectedDeltas.push({ oldTask: prev ?? null, newTask: t });
  }

  // 3) Emit: delete temps first, then affected adds/updates
  const deleteDeltas: TaskDelta[] = oldTasks.map(oldTask => ({ oldTask, newTask: null }));
  await _emitChanges([...deleteDeltas, ...affectedDeltas]);
}

//#region Module Level Intialization and State

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
    const auth = get(authState);
    if (auth.status === 'signed-in') {
      const [userTasks, error] = await api.getAllUserTasks({ userId: auth.user.id });
      if (userTasks) {
        _searchService.reindexTasks(userTasks);
      } else Err.UNHANDLED(error);
    }

    // Subscribe to remote tasks availability store
    if (!_unsubscribeRemoteTasks) {
      _unsubscribeRemoteTasks = remoteTasksStore.subscribe(async (rt) => {
        const previous = _remoteTasks;
        _remoteTasks = rt;
        if (!previous && rt) {
          // Remote just became available; hydrate for current user if present
          const auth = get(authState);
          if (auth.status === 'signed-in') {
            await api.hydrateForUser({ user: auth.user });
          }
        }
      });
    }
  } catch {
    // remain usable offline; methods will assertDB as needed
  }
})();
//#endregion