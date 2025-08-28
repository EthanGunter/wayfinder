import { type IDBPDatabase } from 'idb';
import { type ITaskAdvancedFeatures, type ITaskCore, type ITaskExporter, type ITasks, type ITaskRelations, type ITaskReverter, type ITaskCoreResponseHandler, type ILocalTaskProvider, type CreateTaskParams, type UpdateTaskParams, type DeleteTaskParams } from './types';
import { err, ok } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, NotImplementedError, InvalidStateError, ArgumentError } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task, type TaskData } from './Task';
import { getRelationshipUpdates } from '.';
import JSZip from 'jszip';
import { TaskSearchService } from './TaskSearchService';
import { dbPromise, TASK_TABLE_NAME, AUTH_TABLE_NAME, APP_TABLE_NAME, ACTIVEUSER_NAME, type LocalDB } from '../localDB';
import type { User } from '../Auth/User';
import { extractBatch, extractBatchAndLogErrors, okBatch, type BatchResult, type Result } from '../types';
import { SyncQueue } from '../SyncQueue';


//#region Task CRUD
const taskCRUD: ITaskCore & ITaskCoreResponseHandler = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function ({ createDetail: task }) {
    const [success, errors] = extractBatch(await taskCRUD.createTasks({ createDetails: [task] }));
    if (errors.length > 0) {
      return err(errors[0]);
    } else {
      return ok(success[0]);
    }
  },

  /**
  * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
  * @error {@link IOError} if the IndexedDB.put() attempt fails
  */
  createTasks: ({ createDetails }) => _createTasksLocal(createDetails),
  handleCreateTasksResponse: async function (response) {
    if (response.isErr()) {
      const { createdIds } = response.error;
      await _deleteTasksLocal(createdIds.map(i => ({ id: i })), false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  getTask: async function ({ id }) {
    const [success, errors] = extractBatch(await taskCRUD.getTasks({ ids: [id] }));
    if (errors.length > 0) {
      return err(errors[0]);
    } else {
      return ok(success[0]);
    }
  },

  getTasks: async function ({ ids }) {
    assertDB(_db);
    const tasks: Task[] = [];
    const notFoundIds: string[] = [];

    try {
      for (const id of ids) {
        const task = await _db.get(TASK_TABLE_NAME, id);
        if (task) {
          const taskObj = new Task(task);
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

      return okBatch(tasks, notFoundIds.map(e => new NotFoundError(e, TASK_TABLE_NAME)));
    } catch (e) {
      return err(new IOError("Batch read", ids.join(', '), e));
    }
  },

  getAllUserTasks: async function ({ userId }) {
    assertDB(_db);
    const userTasks = await _db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', userId);
    return okBatch(userTasks.map(t => new Task(t)));
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  updateTask: async function (update) {
    const [success, errors] = extractBatch(await taskCRUD.updateTasks({ updates: [update] }));
    if (errors.length > 0) {
      return err(errors[0]);
    } else {
      return ok(success[0]);
    }
  },

  updateTasks: ({ updates }) => _updateTasksLocal(updates),
  handleUpdateTasksResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldState } = response.error;
      await _updateTasksLocal(oldState.map(t => ({ id: t.updatedId, changes: t.task })), false);
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function (deleteArg) {
    return await taskCRUD.deleteTasks({ deleteArgs: [deleteArg] });
  },

  deleteTasks: ({ deleteArgs }) => _deleteTasksLocal(deleteArgs),
  handleDeleteTasksResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldState } = response.error;
      await _createTasksLocal(oldState, false);
    }
  },

  changeOwnership: ({ oldUserID, newUserID }) => _changeOwnershipLocal(oldUserID, newUserID),
  handleChangeOwnershipResponse: async function (response) {
    if (response.isErr()) {
      assertDB(_db);
      const { oldUserID, newUserID } = response.error;
      await _changeOwnershipLocal(newUserID, oldUserID, false);
    }
  },
}
async function _createTasksLocal(tasks: CreateTaskParams[], updateServer: boolean = true) {
  if (tasks.length === 0) return okBatch([], []);

  assertDB(_db);
  const createdTasks: Task[] = [];
  const errors: ArgumentError[] = [];

  // Get current user to assign ownership
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return err(new InvalidStateError("Cannot create tasks without an authenticated user"));
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
    const preparedTask = new Task(taskWithOwnership);
    preparedTask.created = new Date().toISOString();
    if (!taskDTO.id) {
      preparedTask.id = v4();
    }

    await _db.put(TASK_TABLE_NAME, preparedTask);

    createdTasks.push(preparedTask);
  }

  const relUpdates = await getRelationshipUpdates(api, createdTasks.map(newTask => ({ oldTask: null, newTask })));
  await _updateTasksLocal(relUpdates, false); // Relationship updates should be handled by the server

  // Update search index for newly created tasks
  if (_searchService) {
    createdTasks.forEach(task => _searchService!.indexTask(task));
  }

  if (updateServer && _taskSyncQueue) {
    _taskSyncQueue.add(
      "createTasks",
      { createDetails: tasks },
      "handleCreateTasksResponse",
      { createdIds: createdTasks.map(t => t.id) },
    );
  }

  return okBatch(createdTasks, errors);
};
async function _updateTasksLocal(updates: UpdateTaskParams[], updateServer: boolean = true) {
  if (updates.length === 0) return okBatch([], []);

  assertDB(_db);
  const updatedTasks: Map<Task, Task> = new Map();
  const errors: Err[] = [];

  for (const { id, changes: changes } of updates) {
    // const result = await api.updateTask({ taskOrId, changes: updates });
    const taskResult = await taskCRUD.getTask({ id });
    if (taskResult.isErr()) { errors.push(taskResult.error); continue; }
    const task = taskResult.value;

    // Validate user ownership before allowing update
    if (!(await validateTaskOwnership(task))) {
      errors.push(new NotFoundError(task.id, "Task (unauthorized)"));
      continue;
    }

    const updated: Task = new Task({ ...task, ...changes, last_edit: new Date().toISOString() });

    await _db.put(TASK_TABLE_NAME, updated);

    // We can use the updates id since id can't be changed via update
    updatedTasks.set(task, updated);
  }

  const relUpdates = await getRelationshipUpdates(api, Array.from(updatedTasks).map(([oldTask, newTask]) => ({ oldTask, newTask })));
  await _updateTasksLocal(relUpdates, false);

  // Update search index for updated tasks
  if (_searchService) {
    Array.from(updatedTasks.values()).forEach(task => _searchService!.indexTask(task));
  }

  if (updateServer && _taskSyncQueue) {
    // Queue sync command
    _taskSyncQueue.add(
      "updateTasks",
      { updates },
      'handleUpdateTasksResponse',
      { oldState: Array.from(updatedTasks).map(([task]) => ({ updatedId: task.id, task })) }
    );
  }

  return okBatch(updatedTasks.values().toArray(), errors);
};
async function _deleteTasksLocal(deleteArgs: DeleteTaskParams[], updateServer: boolean = true) {
  if (deleteArgs.length === 0) return ok();

  assertDB(_db);

  const deletedTasks: Task[] = [];
  const errors: NotFoundError[] = [];
  for (const { id, recursive } of deleteArgs) {

    const taskResult = await taskCRUD.getTask({ id });
    if (taskResult.isErr()) {
      errors.push(taskResult.error);
      continue;
    }
    const task = taskResult.value;

    // Validate user ownership before allowing deletion
    if (!(await validateTaskOwnership(task))) {
      errors.push(new NotFoundError(task.id, "Task (unauthorized)"));
      continue;
    }

    if (recursive && task.children.length > 0) {
      // TODO:handle-error
      const result = await _deleteTasksLocal(task.children.map(c => ({ id: c, recursive })));
    }

    deletedTasks.push(task);
    await _db.delete(TASK_TABLE_NAME, task.id);

    // Remove from search index
    if (_searchService) {
      _searchService.removeTask(task.id);
    }

    const relUpdates = await getRelationshipUpdates(api, { oldTask: task, newTask: null });
    await _updateTasksLocal(relUpdates, false);
  }

  if (updateServer && _taskSyncQueue) {
    // Queue Sync command
    _taskSyncQueue.add(
      'deleteTasks',
      { deleteArgs },
      'handleDeleteTasksResponse',
      { oldState: deletedTasks }
    );
  }
  if (errors.length > 0) {
    return err(new IOError("Batch delete", errors));
  }
  return ok();
};
async function _changeOwnershipLocal(oldUserID: string, newUserID: string, updateServer: boolean = true): Promise<BatchResult<Task>> {
  assertDB(_db);
  const originalTasks = await _db.getAllFromIndex('tasks', 'by-user', oldUserID);
  const convertedTasks = originalTasks.map(t => new Task({ ...t, user_id: newUserID }));

  for (const task of convertedTasks) {
    await _db.put('tasks', task);
  }

  if (updateServer && _taskSyncQueue) {
    _taskSyncQueue.add(
      'changeOwnership',
      { oldUserID, newUserID },
      'handleChangeOwnershipResponse',
      { oldUserID, newUserID },
    );
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
        let parents = extractBatchAndLogErrors(parentsBatch);
        return ok(parents);
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
    const rootTasks = allTasks.filter(task =>
      task.parents.length === 0 && task.user_id === currentUser.id);
    return ok(rootTasks.map(t => new Task(t)));
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
    const userTasks = allTasks.filter(t => t.user_id === currentUser.id);
    const today = new Date().toISOString().split('T')[0];
    const todays = userTasks.filter(t => t.todays_task.startsWith(today));
    return ok(todays.map(t => new Task(t)));
  },

  getPrioritizedTasks: async function (limit: number) {
    assertDB(_db);
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return ok([]); // No authenticated user, return empty array
    }

    let taskArray: Task[] = (await _db.getAll(TASK_TABLE_NAME))
      .filter(t => t.user_id === currentUser.id)
      .map(t => new Task(t));

    const roots: Task[] = taskArray.filter(t => t.parents.length === 0);
    const tasksMap: Map<string, Task> = new Map(taskArray.map(t => [t.id, t] as [string, Task]));

    const sorter = (a: Task | undefined, b: Task | undefined) => {
      if (!a) return -1;
      else if (!b) return 1;
      else return (b.priority ?? 0) - (a.priority ?? 0)
    };

    let todoList: Task[] = [];

    const inOrderTraversalAssignment = (task: Task) => {
      if (todoList.length === limit/*  || task.tags?.includes('disabled') */)
        return; // stop searching once all tasks are acquired

      // TODO this lil check right here may not be ideal... user testing will tell
      if (task.children.length === 0) { // is leaf node
        if (!task.completed) {// and it's not already completed
          todoList.push(task); // add to todolist
        }
      }
      else { // continue for all children, starting with highest priority
        const children: (Task | undefined)[] = task.children.map(child => tasksMap.get(child)).sort(sorter)
        for (const child of children) {
          if (!child) continue;

          if (!child.completed) {
            inOrderTraversalAssignment(child);
          }
        }

        if (children.every(c => !c || c.completed) && !task.completed) {
          todoList.push(task);
        }
      }
    }

    roots.sort(sorter)
    for (let i = 0; i < roots.length; i++) {
      if (todoList.length === limit)
        return ok(todoList);

      const root = roots[i];
      inOrderTraversalAssignment(root);
    }

    return ok(todoList);
  },

  searchTasks: async function (searchTerm) {
    if (!_searchService) {
      return [];
    }
    return _searchService.searchTasks(searchTerm);
  },
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
    const taskData = allTasks.filter(task => task.user_id === currentUser.id);
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

      zip.file(filename, Task.toMarkdown(task));
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
let _remoteTasks: ITasks | null = null;
let _searchService: TaskSearchService | null = null;

const api: ITasks & ITaskExporter = { ...taskCRUD, ...taskRelations, ...advancedFeatures, ...dataExporter };

const BrowserTaskProvider: ILocalTaskProvider = {
  /** @param remoteTasks The backend task provider that this provider wraps */
  get: async function (remoteTasks) {
    _db = await dbPromise;

    // Initialize search service
    _searchService = new TaskSearchService();

    // Index existing tasks for the current user
    const currentUser = await getCurrentUser();
    if (currentUser) {
      const existingTasksResult = await taskCRUD.getAllUserTasks({ userId: currentUser.id });
      if (existingTasksResult.isOk()) {
        const tasks = extractBatchAndLogErrors(existingTasksResult);
        _searchService.reindexTasks(tasks);
      }
    }

    if (remoteTasks) {
      _remoteTasks = remoteTasks;
      _taskSyncQueue = new SyncQueue<Omit<ITasks,
        | "getAllUserTasks"
        | "getChildrenOf"
        | "getParentsOf"
        | "getPrioritizedTasks"
        | "getRootTasks"
        | "getTask"
        | "getTasks"
        | "getTodaysTasks"
        | "searchTasks"
      >, ITaskReverter>({
        changeOwnership: remoteTasks.changeOwnership,
        handleChangeOwnershipResponse: taskCRUD.handleChangeOwnershipResponse,
        createTask: remoteTasks.createTask,
        createTasks: remoteTasks.createTasks,
        handleCreateTasksResponse: taskCRUD.handleCreateTasksResponse,
        deleteTask: remoteTasks.deleteTask,
        deleteTasks: remoteTasks.deleteTasks,
        handleDeleteTasksResponse: taskCRUD.handleDeleteTasksResponse,
        updateTask: remoteTasks.updateTask,
        updateTasks: remoteTasks.updateTasks,
        handleUpdateTasksResponse: taskCRUD.handleUpdateTasksResponse,
      });
    }
    return { ...api, getSyncQueue: () => _taskSyncQueue, hasRemote: () => !!_remoteTasks };
  },
}

let _taskSyncQueue: SyncQueue<Omit<ITasks,
  | "getAllUserTasks"
  | "getChildrenOf"
  | "getParentsOf"
  | "getPrioritizedTasks"
  | "getRootTasks"
  | "getTask"
  | "getTasks"
  | "getTodaysTasks"
  | "searchTasks"
>, ITaskReverter> | null = null;

export default BrowserTaskProvider;

//#region Utilities

function assertDB(db: LocalDB | null): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError("Attempted to use BrowserTaskProvider without a db connection. Make sure to call .get()"));
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