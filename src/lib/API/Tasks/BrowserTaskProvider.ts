import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CreateTaskDTO, type IAdvancedTaskProvider, type IProvider, type ITaskCRUDProvider, type ITaskExporter, type ITaskProvider, type ITaskRelationProvider } from './types';
import { err, ok, Result } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, NotImplementedError } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task } from './Task';
import { updateRelationships } from '.';
import JSZip from 'jszip';
import { TASK_STORE_NAME, tasksDBPromise, type TaskDB } from '../localDB';


const taskCRUD: ITaskCRUDProvider = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function (task: CreateTaskDTO): Promise<Result<Task, IOError | ParseError>> {
    assertDB(db);
    const preparedTask = new Task(task);
    preparedTask.created = new Date().toISOString();
    preparedTask.id = v4();

    updateRelationships(api, { oldTask: null, newTask: preparedTask });

    await db.put(TASK_STORE_NAME, preparedTask);
    return ok(new Task(preparedTask));
  },

  /**
  * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
  * @error {@link IOError} if the IndexedDB.put() attempt fails
  */
  createTasks: async function (tasks: CreateTaskDTO[]): Promise<Result<Task[], IOError | ParseError>> {
    assertDB(db);
    const createdTasks: Task[] = [];
    const transaction = db.transaction(TASK_STORE_NAME, 'readwrite');

    try {
      for (const taskDTO of tasks) {
        const preparedTask = new Task(taskDTO);
        preparedTask.created = new Date().toISOString();
        preparedTask.id = v4();

        updateRelationships(api, { oldTask: null, newTask: preparedTask });

        await transaction.store.put(preparedTask);
        createdTasks.push(new Task(preparedTask));
      }

      await transaction.done;
      return ok(createdTasks);
    } catch (e) {
      return err(new IOError("Batch create", "multiple tasks", e));
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  readTask: async function (id: string): Promise<Result<Task, NotFoundError | ParseError>> {
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
    const task = await db.get(TASK_STORE_NAME, id);
    if (!task) {
      return err(new NotFoundError(id, 'Task').withTrace(1));
    }
    return ok(task);
    // }
  },

  readTasks: async function (ids: string[]): Promise<Result<Task[], NotFoundError | Err>> {
    assertDB(db);
    const tasks: Task[] = [];
    const notFoundIds: string[] = [];

    try {
      for (const id of ids) {
        const task = await db.get(TASK_STORE_NAME, id);
        if (task) {
          tasks.push(task);
        } else {
          notFoundIds.push(id);
        }
      }

      if (notFoundIds.length > 0) {
        return err(new NotFoundError(notFoundIds.join(', '), TASK_STORE_NAME).withTrace(1));
      }

      return ok(tasks);
    } catch (e) {
      return err(new IOError("Batch read", ids.join(', '), e));
    }
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  updateTask: async function (key: string, updates: Partial<Task>): Promise<Result<Task, Err>> {
    return (await taskCRUD.readTask(key)).match(
      async (task) => {
        assertDB(db);
        const updated: Task = new Task({ ...task, ...updates, last_edit: new Date().toISOString() });

        updateRelationships(api, { oldTask: task, newTask: updated });

        await db.put(TASK_STORE_NAME, updated);
        return ok(updated);
      },
      error => err(error)
    );
  },

  updateTasks: async function (list: { task: string | Task; updates: Partial<Task>; }[]): Promise<Result<Task[], Err>> {
    assertDB(db);
    const updatedTasks: Task[] = [];
    const transaction = db.transaction(TASK_STORE_NAME, 'readwrite');

    try {
      for (const { task, updates } of list) {
        // Get the existing task
        let existingTask: Task;
        if (typeof task === 'string') {
          const taskResult = await taskCRUD.readTask(task);
          if (taskResult.isErr()) {
            return err(taskResult.error);
          }
          existingTask = taskResult.value;
        } else {
          existingTask = task;
        }

        // Create updated task
        const updated: Task = new Task({
          ...existingTask,
          ...updates,
          last_edit: new Date().toISOString()
        });

        updateRelationships(api, { oldTask: existingTask, newTask: updated });

        await transaction.store.put(updated);
        updatedTasks.push(updated);
      }

      await transaction.done;
      return ok(updatedTasks);
    } catch (e) {
      return err(new IOError("Batch update", "multiple tasks", e));
    }
  },

  /**
   * @param id Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function (id: string, recursive?: boolean): Promise<Result<void, Err>> {
    assertDB(db);
    if (recursive) throw new NotImplementedError("BrowserTaskStorage.deleteTask(recursive = true)");

    const task = await db.get(TASK_STORE_NAME, id);

    if (task && task.filepath) {
      try {
        await db.delete(TASK_STORE_NAME, id);
      } catch (e) {
        // TODO Throw an error during development/testing ONLY
        // https://github.com/LZS911/vite-plugin-conditional-compile
        throw new IOError("Delete", id, e);
      }
      updateRelationships(api, { oldTask: task, newTask: null });
      return ok();
    }
    else return err(new NotImplementedError("BrowserTaskStorage.deleteTask where !task.filepath"));
  },

  deleteTasks: async function (list: { id: string; recursive?: boolean; }[]): Promise<Result<void, Err>> {
    assertDB(db);

    // Check if any deletion requests are recursive
    if (list.some(item => item.recursive)) {
      return err(new NotImplementedError("BrowserTaskStorage.deleteTasks with recursive = true"));
    }

    const transaction = db.transaction(TASK_STORE_NAME, 'readwrite');

    try {
      for (const { id } of list) {
        const task = await transaction.store.get(id);

        if (task) {
          await transaction.store.delete(id);
          updateRelationships(api, { oldTask: task, newTask: null });
        }
      }

      await transaction.done;
      return ok();
    } catch (e) {
      return err(new IOError("Batch delete", list.map(item => item.id).join(', '), e));
    }
  }
}


const taskRelations: ITaskRelationProvider = {
  getChildrenOf: async function (task: string | Task): Promise<Result<Task[], Err>> {
    // First get the parent task to access its children array
    let parentTask: Task;
    if (typeof task === "string") {
      const parentTaskResult = await taskCRUD.readTask(task);
      if (parentTaskResult.isErr()) {
        return err(parentTaskResult.error);
      } else parentTask = parentTaskResult.value;
    } else parentTask = task;

    if (parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specific child tasks
    const childPromises = parentTask.children.map(childId => taskCRUD.readTask(childId));
    const childResults = await Promise.all(childPromises);

    // Filter out any failed reads and extract successful tasks
    const children = childResults
      .filter(result => result.isOk())
      .map(result => result.value as Task);

    return ok(children);
  },
  getParentsOf: async function (task: string | Task): Promise<Result<Task[], Err>> {
    let childTask: Task;

    // Convert id to task object
    if (typeof task === "string") {
      const childTaskResult = await taskCRUD.readTask(task);
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = task;

    // Get the parents
    if (childTask.parents.length > 0) {
      const parentResult = await taskCRUD.readTasks(childTask.parents);
      if (parentResult.isErr()) return err(parentResult.error);

      return ok(parentResult.value);
    }

    return ok([]);
  },

  getRootTasks: async function (): Promise<Result<Task[], Err>> {
    assertDB(db);
    const allTasks = await db.getAll(TASK_STORE_NAME);
    const rootTasks = allTasks.filter(task => task.parents.length === 0);
    return ok(rootTasks);
  }
}


const advancedFeatures: IAdvancedTaskProvider = {
  getTodaysTasks: async function (): Promise<Result<Task[], Err>> {
    assertDB(db);
    const allTasks = await db.getAll(TASK_STORE_NAME);
    return ok(allTasks.filter(t => t.todays_task));
  },

  getPrioritizedTasks: async function (limit: number): Promise<Result<Task[], Err>> {
    assertDB(db);
    let taskArray: Task[] = await db.getAll(TASK_STORE_NAME);

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

  searchTasks: function (searchTerm: string): Promise<Task[]> {
    throw new Error('Function not implemented.');
  }
}

const dataExporter: ITaskExporter = {
  exportData: async function (simplify?: boolean): Promise<void> {
    assertDB(db);
    const taskData = await db.getAll(TASK_STORE_NAME);
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
  importData: function (data: string): Promise<number> {
    throw new Error('Function not implemented.');
  }
}

const api: ITaskProvider & ITaskExporter = { ...taskCRUD, ...taskRelations, ...advancedFeatures, ...dataExporter };

let db: IDBPDatabase<TaskDB> | null;

const BrowserTaskProvider: IProvider<ITaskProvider & ITaskExporter> = {
  get: async function (): Promise<ITaskProvider & ITaskExporter> {
    db = await tasksDBPromise;
    return api;
  },

  close: async function (): Promise<void> {
    db?.close();
    db = null;
  }
}

export default BrowserTaskProvider;

//#region Utilities

function assertDB(db: IDBPDatabase<TaskDB> | null): asserts db is IDBPDatabase<TaskDB> {
  if (!db) throw new Error("Attempted to use BrowserTaskProvider without a db connection. Make sure to call .get()")
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