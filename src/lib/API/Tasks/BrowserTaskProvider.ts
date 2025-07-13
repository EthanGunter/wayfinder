import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CreateTaskDTO, type IAdvancedTaskProvider, type IProvider, type ITaskCRUDProvider, type ITaskExporter, type ITaskProvider, type ITaskRelationProvider } from './types';
import { err, ok, Result } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, NotImplementedError } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task } from './Task';
import { updateRelationships } from '.';

interface MyDB extends DBSchema {
  files: {
    key: string;
    value: { filepath: string; content: string };
  };
  index: {
    key: string;
    value: Task;
  };
}

function TryGetIDFromFilepath(key: string): string {
  if (key.endsWith(".md")) {
    return key.split("/").slice(-1)[0].split(".")[0];
  }
  return key;
}

let db: IDBPDatabase<MyDB> | null;

const core: IProvider<ITaskProvider> = {
  get: async function (): Promise<ITaskProvider> {
    db = await openDB<MyDB>('wayfinder', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'filepath' });
        db.createObjectStore('index', { keyPath: 'id' });
      },
    });
    return taskProvider;
  },

  close: async function (): Promise<void> {
    db?.close();
    db = null;
  }
}


const taskCRUD: ITaskCRUDProvider = {
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  createTask: async function (task: CreateTaskDTO): Promise<Result<Task, IOError | ParseError>> {
    const preparedTask = new Task(task);
    preparedTask.created = new Date().toISOString();
    preparedTask.id = v4();

    updateRelationships(taskProvider, null, preparedTask);

    return (await writeTaskToDB(preparedTask)).match(
      success => {
        return ok(new Task(preparedTask));
      },
      error => err(error))
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  readTask: async function (key: string): Promise<Result<Task, NotFoundError | ParseError>> {
    assertDB(db);
    if (key.endsWith(".md")) {
      // Filepath
      // Get the .md file content
      const file = await db.get('files', key);
      if (!file) {
        return err(new NotFoundError(key, 'Task File').withTrace(1));
      }
      // Parse and return
      return Task.fromMarkdown(file.content, key);
    } else {
      // Task ID
      const task = await db.get('index', key);
      if (!task) {
        return err(new NotFoundError(key, 'Task').withTrace(1));
      }
      return ok(task);
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
      async task => {
        const updated: Task = new Task({ ...task, ...updates, last_edit: new Date().toISOString() });

        updateRelationships(taskProvider, task, updated);

        return (await writeTaskToDB(updated)).match(
          () => ok(updated),
          error => err(error)
        );
      },
      error => err(error)
    )
  },

  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  deleteTask: async function (key: string, recursive?: boolean): Promise<Result<void, Err>> {
    assertDB(db);
    if (recursive) throw new NotImplementedError("BrowserTaskStorage.deleteTask(recursive = true)");

    key = TryGetIDFromFilepath(key);

    const task = await db.get('index', key);

    if (task && task.filepath) {
      try {
        await db.delete('files', task.filepath);
        await db.delete('index', key);
      } catch (e) {
        // TODO Throw an error during development/testing ONLY
        // https://github.com/LZS911/vite-plugin-conditional-compile
        throw new IOError("Delete", key, e);
      }
      updateRelationships(taskProvider, task, null);
      return ok();
    }
    else return err(new NotImplementedError("BrowserTaskStorage.deleteTask where !task.filepath"))
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

    if (!parentTask.children || parentTask.children.length === 0) {
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
    const parents: Task[] = [];
    let childTask: Task;

    if (typeof task === "string") {

      const childTaskResult = await taskCRUD.readTask(task);
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = task;

    if (childTask.parents) {
      const parentResult = await taskCRUD.readTask(childTask.parents[0]);
      if (parentResult.isErr()) return err(parentResult.error);
      else parents.push(parentResult.value);
    }

    return ok(parents);
  },
  getRootTasks: async function (): Promise<Result<Task[], Err>> {
    assertDB(db);
    const allTasks = await db.getAll('index');
    const rootTasks = allTasks.filter(task => !task.parents);
    return ok(rootTasks);
  }
}


const advancedFeatures: IAdvancedTaskProvider = {
  getTodaysTasks: async function (): Promise<Result<Task[], Err>> {
    const todaysTaskIds = JSON.parse(localStorage.getItem('todaysTasks') || '[]') as string[];
    const tasks = await Promise.all(todaysTaskIds.map(id => taskCRUD.readTask(id)));
    const successfulTasks = tasks.filter(r => r.isOk()).map(r => r.value as Task);
    return ok(successfulTasks);
  },

  getPrioritizedTasks: async function (limit: number): Promise<Result<Task[], Err>> {
    assertDB(db);
    let taskArray: Task[] = await db.getAll('index');

    const roots: Task[] = taskArray.filter(t => !t.parents);
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
      if (!task.children || task.children.length === 0) { // is leaf node
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
  exportData: function (simplify?: boolean): Promise<string> {
    throw new Error('Function not implemented.');
  },
  importData: function (data: string): Promise<number> {
    throw new Error('Function not implemented.');
  }
}

const taskProvider: ITaskProvider = { ...core, ...taskCRUD, ...taskRelations, ...advancedFeatures };
export default taskProvider;

//#region Utilities

function assertDB(db: IDBPDatabase<MyDB> | null): asserts db is IDBPDatabase<MyDB> {
  if (!db) throw new Error("Attempted to use BrowserTaskProvider without a db connection. Make sure to call .get()")
}

async function writeTaskToDB(task: Task): Promise<Result<void, IOError>> {
  assertDB(db);
  if (!task.filepath) task.filepath = task.id + ".md";
  const md = Task.toMarkdown(task);

  try {
    // Create the .md file
    await db.put('files', { filepath: task.filepath, content: md });
  } catch (e) {
    return err(new IOError(`Failed to write ${task.filepath}`, e, md));
  }

  // Update the DB with the new file's data
  const updateRes = await updateIndexFromFile(task.filepath);
  if (updateRes.isErr()) {
    return err(updateRes.error);
  }
  return ok();
}
/**
 * @error {@link NotFoundError} if the file doesn't exist in the IndexedDB
 * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
 */
async function updateIndexFromFile(filepath: string): Promise<Result<void, NotFoundError | ParseError>> {
  assertDB(db);
  const file = await db.get('files', filepath);

  if (!file) {
    return err(new NotFoundError(filepath, "File"));
  }

  return Task.fromMarkdown(file.content, filepath).match(
    async task => {
      await db!.put('index', task);
      return ok();
    },
    error => {
      return err(error);
    });
}
//#endregion


//TODO #if TEST
export { db, updateIndexFromFile, writeTaskToDB }
//#endif