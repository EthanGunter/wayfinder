import { type IDBPDatabase } from 'idb';
import { type ITaskAdvancedFeatures, type ITaskCore, type ITaskExporter, type ITaskAPI, type ITaskRelations, type ITaskReverter, type ITaskCoreResponseHandler, type ILocalTaskProvider } from './types';
import { err, ok } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, NotImplementedError, InvalidStateError } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task, type TaskData } from './Task';
import { updateRelationships } from '.';
import JSZip from 'jszip';
import { dbPromise, TASK_TABLE_NAME, type LocalDB } from '../localDB';
import { extractBatchAndLogErrors, okBatch, type Result } from '../types';
import { SyncQueue } from '../SyncQueue';

// TODO: Implement update queue system
// TODO: Wrap the task API so we call local functions first, then the remote,
// TODO: and handle rolling back local changes whenever the remote fails...
const taskCRUD: ITaskCore & ITaskCoreResponseHandler = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function ({ createDetail: task }) {
    assertDB(db);
    const preparedTask = new Task(task);
    preparedTask.created = new Date().toISOString();
    preparedTask.id = v4();

    await db.put(TASK_TABLE_NAME, preparedTask);
    await updateRelationships(api, { oldTask: null, newTask: preparedTask });

    return ok(new Task(preparedTask));
  },

  /**
  * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
  * @error {@link IOError} if the IndexedDB.put() attempt fails
  */
  createTasks: async function ({ createDetails: tasks }) {
    assertDB(db);
    const createdTasks: Result<Task, Err>[] = [];
    const createdIds: string[] = [];
    const transaction = db.transaction(TASK_TABLE_NAME, 'readwrite');

    for (const taskDTO of tasks) {
      const preparedTask = new Task(taskDTO);
      preparedTask.created = new Date().toISOString();
      preparedTask.id = v4();

      try {
        await updateRelationships(api, { oldTask: null, newTask: preparedTask });

        const createdId = await transaction.store.put(preparedTask);
        createdTasks.push(ok(new Task(preparedTask)));
        createdIds.push(createdId);
      }
      catch (e) {
        createdTasks.push(err(Err.wrap(e as Error)));
      }
    }

    await transaction.done;

    taskSyncQueue?.add(
      "createTasks",
      { createDetails: tasks },
      "handleCreateTasksResponse",
      { createdIds },
    )
    return ok(createdTasks);
  },
  handleCreateTasksResponse: async function (response) {
    if (response.isErr()) {
      const { createdIds } = response.error;
    }
    Err.throw(new NotImplementedError("BrowserTaskProvider.undoCreateTasks"));
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  getTask: async function ({ id }) {
    assertDB(db);
    // if (key.endsWith(".md")) {
    //   // Filepath
    //   // Get the .md file content
    //   const file = await db.get('files', key);
    //   if (!file) {
    //     return err(new NotFoundError(key, 'Task File').withTrace(1));
    //   }
    //   // Parse and return
    //   return Task.fromMarkdown(file.content, key);
    // } else {
    // Task ID
    const task = await db.get(TASK_TABLE_NAME, id);
    if (!task) {
      return err(new NotFoundError(id, 'Task').withTrace(1));
    }
    return ok(new Task(task));
    // }
  },

  getTasks: async function ({ ids }) {
    assertDB(db);
    const tasks: Task[] = [];
    const notFoundIds: string[] = [];

    try {
      for (const id of ids) {
        const task = await db.get(TASK_TABLE_NAME, id);
        if (task) {
          tasks.push(new Task(task));
        } else {
          notFoundIds.push(id);
        }
      }

      if (notFoundIds.length > 0) {
        return err(new NotFoundError(notFoundIds.join(', '), TASK_TABLE_NAME).withTrace(1));
      }

      return okBatch(tasks);
    } catch (e) {
      return err(new IOError("Batch read", ids.join(', '), e));
    }
  },

  getAllUserTasks: async function ({ userId }) {
    assertDB(db);
    const userTasks = await db.getAllFromIndex(TASK_TABLE_NAME, 'by-user', userId);
    return okBatch(userTasks.map(t => new Task(t)));
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  updateTask: async function ({ taskOrId, changes }) {
    assertDB(db);
    let task: Task;
    if (typeof taskOrId == 'string') {
      const taskResponse = await db.get(TASK_TABLE_NAME, taskOrId);
      if (!taskResponse) return err(new NotFoundError("Task not found for update", taskOrId));
      task = new Task(taskResponse);
    } else {
      task = taskOrId;
    }

    const updated: Task = new Task({ ...task, ...changes, last_edit: new Date().toISOString() });

    await db.put(TASK_TABLE_NAME, updated);
    updateRelationships(api, { oldTask: task, newTask: updated });

    // TODO Queue remote updateTask

    return ok(updated);
  },

  updateTasks: async function ({ updateList }) {
    assertDB(db);
    const updatedTasks: Task[] = [];
    const originalTasks: Task[] = [];
    const transaction = db.transaction(TASK_TABLE_NAME, 'readwrite');

    try {
      for (const { taskOrId, changes: updates } of updateList) {
        let task: Task;
        if (typeof taskOrId === 'string') {
          const taskResult = await taskCRUD.getTask({ id: taskOrId });
          if (taskResult.isErr()) {
            return err(taskResult.error);
          }
          task = taskResult.value;
        } else {
          task = taskOrId;
        }
        originalTasks.push(new Task(task));

        const updated: Task = new Task({
          ...task,
          ...updates,
          last_edit: new Date().toISOString()
        });

        updateRelationships(api, { oldTask: task, newTask: updated });

        await transaction.store.put(updated);
        updatedTasks.push(updated);
      }

      await transaction.done;

      // TODO Queue remote update

      return okBatch(updatedTasks);
    } catch (e) {
      return err(new IOError("Batch update", "multiple tasks", e));
    }
  },
  handleUpdateTasksResponse: async function (response) {
    if (response.isErr()) {
      const { updateList } = response.error;
    }
    Err.throw(new NotImplementedError("BrowserTaskProvider.handleUpdateTasksResponse"))
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function ({ id, recursive }) {
    assertDB(db);
    if (recursive) Err.throw(new NotImplementedError("BrowserTaskStorage.deleteTask(recursive = true)"));

    const task = await db.get(TASK_TABLE_NAME, id);

    if (task) {
      try {
        await db.delete(TASK_TABLE_NAME, id);
        updateRelationships(api, { oldTask: task, newTask: null });

        if (remoteDB) {
          remoteDB.deleteTask({ id, recursive }).then(result => {
            if (result.isErr()) {
              console.error("Remote deleteTask failed, reverting local change", result.error);
              db?.put(TASK_TABLE_NAME, task);
              updateRelationships(api, { oldTask: null, newTask: task });
            }
          });
        }
        return ok();
      } catch (e) {
        Err.throw(new IOError("Delete", id, e));
      }
    }
    else return err(new NotImplementedError("BrowserTaskStorage.deleteTask where !task.filepath"));
  },

  deleteTasks: async function ({ deleteList }) {
    assertDB(db);

    if (deleteList.some(item => item.recursive)) {
      return err(new NotImplementedError("BrowserTaskStorage.deleteTasks with recursive = true"));
    }

    const transaction = db.transaction(TASK_TABLE_NAME, 'readwrite');
    const deletedTasks: TaskData[] = [];

    try {
      for (const { id } of deleteList) {
        const task = await transaction.store.get(id);

        if (task) {
          deletedTasks.push(task);
          await transaction.store.delete(id);
          updateRelationships(api, { oldTask: task, newTask: null });
        }
      }

      await transaction.done;

      if (remoteDB) {
        remoteDB.deleteTasks({ deleteList }).then(result => {
          if (result.isErr()) {
            console.error("Remote deleteTasks failed, reverting local changes", result.error);
            const tx = db!.transaction(TASK_TABLE_NAME, 'readwrite');
            for (const task of deletedTasks) {
              tx.store.put(task);
              updateRelationships(api, { oldTask: null, newTask: task });
            }
            tx.done;
          }
        });
      }

      return ok();
    } catch (e) {
      return err(new IOError("Batch delete", deleteList.map(item => item.id).join(', '), e));
    }
  },
  handleDeleteTasksResponse: async function (response) {
    if (response.isErr()) {
      const { deleteList } = response.error;
    }
    Err.throw(new NotImplementedError("BrowserTaskProvider.handleDeleteTasksResponse"))
  },

  changeOwnership: async function ({ oldUserID, newUserID }) {
    assertDB(db);
    const originalTasks = await db.getAllFromIndex('tasks', 'by-user', oldUserID);
    const convertedTasks = originalTasks.map(t => new Task({ ...t, user_id: newUserID }));

    for (const task of convertedTasks) {
      await db!.put('tasks', task);
    }

    // TODO Queue remote update

    return okBatch(convertedTasks);
  },
  handleChangeOwnershipResponse: async function (response) {
    const params = response;
    Err.throw(new NotImplementedError("BrowserTaskProvider.handleChangeOwnershipResponse"))
  },
}

const taskRelations: ITaskRelations = {
  getChildrenOf: async function ({ taskOrId }) {
    // First get the parent task to access its children array
    let parentTask: Task;
    if (typeof taskOrId === "string") {
      const parentTaskResult = await taskCRUD.getTask({ id: taskOrId });
      if (parentTaskResult.isErr()) {
        return err(parentTaskResult.error);
      } else parentTask = parentTaskResult.value;
    } else parentTask = taskOrId;

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
  getParentsOf: async function ({ taskOrId }) {
    let childTask: Task;

    // Convert id to task object
    if (typeof taskOrId === "string") {
      const childTaskResult = await taskCRUD.getTask({ id: taskOrId });
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = taskOrId;

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
    assertDB(db);
    const allTasks = await db.getAll(TASK_TABLE_NAME);
    const rootTasks = allTasks.filter(task => task.parents.length === 0);
    return ok(rootTasks.map(t => new Task(t)));
  }
}


const advancedFeatures: ITaskAdvancedFeatures = {
  getTodaysTasks: async function () {
    assertDB(db);
    const allTasks = await db.getAll(TASK_TABLE_NAME);
    return ok(allTasks.filter(t => t.todays_task).map(t => new Task(t)));
  },

  getPrioritizedTasks: async function (limit: number) {
    assertDB(db);
    let taskArray: Task[] = (await db.getAll(TASK_TABLE_NAME)).map(t => new Task(t));

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

  searchTasks: function (searchTerm) {
    Err.throw(new NotImplementedError('BrowserTaskProvider.searchTasks'));
  },
}

const dataExporter: ITaskExporter = {
  exportData: async function ({ simplify }) {
    assertDB(db);
    const taskData = await db.getAll(TASK_TABLE_NAME);
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


let db: LocalDB | null;
let remoteDB: ITaskAPI | null

const api: ITaskAPI & ITaskExporter = { ...taskCRUD, ...taskRelations, ...advancedFeatures, ...dataExporter };

const BrowserTaskProvider: ILocalTaskProvider = {
  /** @param remoteTasks The backend task provider that this provider wraps */
  get: async function (remoteTasks) {
    db = await dbPromise;
    remoteDB = remoteTasks ?? null;
    
    if (remoteTasks) {
      taskSyncQueue = new SyncQueue<Omit<ITaskAPI,
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
        // handleCreateTaskResponse: taskCRUD.handleCreateTaskResponse,
        createTasks: remoteTasks.createTasks,
        handleCreateTasksResponse: taskCRUD.handleCreateTasksResponse,
        deleteTask: remoteTasks.deleteTask,
        // handleDeleteTaskResponse: taskCRUD.handleDeleteTaskResponse,
        deleteTasks: remoteTasks.deleteTasks,
        handleDeleteTasksResponse: taskCRUD.handleDeleteTasksResponse,
        updateTask: remoteTasks.updateTask,
        // handleUpdateTaskResponse: taskCRUD.handleUpdateTaskResponse,
        updateTasks: remoteTasks.updateTasks,
        handleUpdateTasksResponse: taskCRUD.handleUpdateTasksResponse,
      });
    }
    return [api, taskSyncQueue];
  },
}

let taskSyncQueue: SyncQueue<Omit<ITaskAPI,
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


//TODO #if TEST
export { db, /* updateIndexFromFile,  writeTaskToDB */ }
//#endif