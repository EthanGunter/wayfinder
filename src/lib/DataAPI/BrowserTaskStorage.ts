import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CreateTaskDTO, type ITaskStorage } from './types';
import { err, ok, Result } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, ArgumentError, NotImplemented } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task } from './Task';

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

export class BrowserTaskStorage implements ITaskStorage {
  private static instance: BrowserTaskStorage | undefined;
  private db!: IDBPDatabase<MyDB>;

  private constructor() { }

  static async get(): Promise<BrowserTaskStorage> {
    if (!this.instance) {
      const storage = new BrowserTaskStorage();
      storage.db = await openDB<MyDB>('wayfinder', 1, {
        upgrade(db) {
          db.createObjectStore('files', { keyPath: 'filepath' });
          db.createObjectStore('index', { keyPath: 'id' });
        },
      });
      this.instance = storage
    }
    return this.instance;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  //#region CRUD Operations

  // 👍
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  async createTask(task: CreateTaskDTO): Promise<Result<string, IOError | ParseError>> {
    const preparedTask = task as Task;
    preparedTask.created = new Date().toISOString();
    preparedTask.id = v4();

    this.updateRelationships(null, preparedTask);

    return (await this.writeTaskToDB(preparedTask)).match(
      success => {
        return ok(preparedTask.id);
      },
      error => err(error))
  }

  // 👍
  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async readTask(key: string): Promise<Result<Task, NotFoundError | ParseError>> {
    if (key.endsWith(".md")) {
      // Filepath
      // Get the .md file content
      const file = await this.db.get('files', key);
      if (!file) {
        return err(new NotFoundError(key, 'Task File').withTrace(1));
      }
      // Parse and return
      return Task.fromMarkdown(file.content, key);
    } else {
      // Task ID
      const task = await this.db.get('index', key);
      if (!task) {
        return err(new NotFoundError(key, 'Task').withTrace(1));
      }
      return ok(task);
    }
  }

  // 👍
  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async updateTask(key: string, updates: Partial<Task>): Promise<Result<Task, NotFoundError | IOError | ParseError>> {
    return (await this.readTask(key)).match(
      async task => {
        const updated: Task = new Task({ ...task, ...updates, lastEdit: new Date().toISOString() });

        this.updateRelationships(task, updated);

        return (await this.writeTaskToDB(updated)).match(
          () => ok(updated),
          error =>
            err(error)
        );
      },
      error => err(error)
    )
  }

  // 👍
  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @param recursive NOT IMPLEMENTED
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  async deleteTask(key: string, recursive: boolean = false): Promise<Result<void, Err>> {
    if (recursive) throw new NotImplemented("BrowserTaskStorage.deleteTask(recursive = true)");

    key = TryGetIDFromFilepath(key);

    const task = await this.db.get('index', key);

    if (task) {
      try {
        await this.db.delete('files', task.filepath);
        await this.db.delete('index', key);
      } catch (e) {
        // TODO Throw an error during development/testing ONLY
        // https://github.com/LZS911/vite-plugin-conditional-compile
        throw new IOError("Delete", key, e);
      }
    }

    return ok();
  }

  // #endregion


  // #region Relationship Operations

  async getChildren(task: string | Task): Promise<Result<Task[], Err>> {
    // First get the parent task to access its children array
    let parentTask: Task;
    if (typeof task === "string") {
      const parentTaskResult = await this.readTask(task);
      if (parentTaskResult.isErr()) {
        return err(parentTaskResult.error);
      } else parentTask = parentTaskResult.value;
    } else parentTask = task;

    if (!parentTask.children || parentTask.children.length === 0) {
      return ok([]);
    }

    // Fetch only the specific child tasks
    const childPromises = parentTask.children.map(childId => this.readTask(childId));
    const childResults = await Promise.all(childPromises);

    // Filter out any failed reads and extract successful tasks
    const children = childResults
      .filter(result => result.isOk())
      .map(result => result.value as Task);

    return ok(children);
  }

  async getParents(task: string | Task): Promise<Result<Task[], Err>> {
    const parents: Task[] = [];
    let childTask: Task;

    if (typeof task === "string") {

      const childTaskResult = await this.readTask(task);
      if (childTaskResult.isErr()) {
        return err(childTaskResult.error);
      } else childTask = childTaskResult.value;
    } else childTask = task;

    if (childTask.parent) {
      const parentResult = await this.readTask(childTask.parent);
      if (parentResult.isErr()) return err(parentResult.error);
      else parents.push(parentResult.value);
    }

    return ok(parents);
  }

  async getRootTasks(): Promise<Result<Task[], Err>> {
    const allTasks = await this.db.getAll('index');
    const rootTasks = allTasks.filter(task => !task.parent);
    return ok(rootTasks);
  }

  // #endregion


  // #region Extra public API operations

  async getTodaysTasks(): Promise<Result<Task[], Err>> {
    const todaysTaskIds = JSON.parse(localStorage.getItem('todaysTasks') || '[]') as string[];
    const tasks = await Promise.all(todaysTaskIds.map(id => this.readTask(id)));
    const successfulTasks = tasks.filter(r => r.isOk()).map(r => r.value as Task);
    return ok(successfulTasks);
  }

  async setTodaysTask(id: string, position: number): Promise<Result<void, Err>> {
    const todaysTaskIds = JSON.parse(localStorage.getItem('todaysTasks') || '[]') as string[];
    const index = todaysTaskIds.indexOf(id);
    if (index > -1) {
      todaysTaskIds.splice(index, 1);
    }
    todaysTaskIds.splice(position, 0, id);
    localStorage.setItem('todaysTasks', JSON.stringify(todaysTaskIds));
    return ok(undefined);
  }

  async removeTodaysTask(id: string): Promise<Result<void, Err>> {
    let todaysTaskIds = JSON.parse(localStorage.getItem('todaysTasks') || '[]') as string[];
    todaysTaskIds = todaysTaskIds.filter(taskId => taskId !== id);
    localStorage.setItem('todaysTasks', JSON.stringify(todaysTaskIds));
    return ok(undefined);
  }

  async getPrioritizedTasks(limit: number): Promise<Result<Task[], Err>> {
    let taskArray: Task[] = await this.db.getAll('index');

    const roots: Task[] = taskArray.filter(t => !t.parent);
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
  }

  searchTasks(searchTerm: string): Promise<Task[]> {
    throw new Error('Method not implemented.');
  }
  exportData(simplify?: boolean): Promise<string> {
    throw new Error('Method not implemented.');
  }
  importData(data: string): Promise<number> {
    throw new Error('Method not implemented.');
  }

  // #endregion


  //#region Utilities

  private async updateRelationships(oldTask: Task | null, newTask: Task | null) {
    if (!oldTask && newTask) {
      // Add new task to all relationships
      if (newTask.children) {
        this.addAsParent(newTask.id, newTask.children);
      }
      if (newTask.parent) {
        this.addAsChild(newTask.id, [newTask.parent]);
      }
    }
    else if (oldTask && !newTask) {
      // Remove oldTask from all relationships
      if (oldTask.children) {
        this.removeAsParent(oldTask.id, oldTask.children);
      }
      if (oldTask.parent) {
        this.removeAsChild(oldTask.id, [oldTask.parent]);
      }
    }
    else if (oldTask && newTask) {
      if (oldTask.parent !== newTask.parent) {
        if (oldTask.parent) {
          // Remove old parent
          this.removeAsChild(oldTask.id, [oldTask.parent]);
        }

        if (newTask.parent) {
          // Add new parent
          this.addAsChild(oldTask.id, [newTask.parent]);
        }
      }

      const addedChildren = newTask.children?.filter(x => !oldTask.children?.includes(x));
      const removedChildren = oldTask.children?.filter(x => !newTask.children?.includes(x));
      if (addedChildren && addedChildren.length > 0) {
        this.addAsParent(newTask.id, addedChildren);
      }
      if (removedChildren && removedChildren.length > 0) {
        this.removeAsParent(newTask.id, removedChildren);
      }
    }
  }


  private async addAsParent(parentId: string, childIds: string[]) {
    // Update each child to have this parent
    for (const childId of childIds) {
      const childResult = await this.readTask(childId);
      if (childResult.isOk()) {
        const child = childResult.value;
        child.parent = parentId;
        await this.writeTaskToDB(child);
      }
    }
  }

  private async addAsChild(childId: string, parentIds: string[]) {
    // Update each parent to include this child
    for (const parentId of parentIds) {
      const parentResult = await this.readTask(parentId);
      if (parentResult.isOk()) {
        const parent = parentResult.value;
        if (!parent.children) {
          parent.children = [];
        }
        if (!parent.children.includes(childId)) {
          parent.children.push(childId);
          await this.writeTaskToDB(parent);
        }
      }
    }
  }

  private async removeAsParent(parentId: string, childIds: string[]) {
    // Update each child to remove this parent
    for (const childId of childIds) {
      const childResult = await this.readTask(childId);
      if (childResult.isOk()) {
        const child = childResult.value;
        if (child.parent === parentId) {
          child.parent = undefined;
          await this.writeTaskToDB(child);
        }
      }
    }
  }

  private async removeAsChild(childId: string, parentIds: string[]) {
    // Update each parent to remove this child
    for (const parentId of parentIds) {
      const parentResult = await this.readTask(parentId);
      if (parentResult.isOk()) {
        const parent = parentResult.value;
        if (parent.children) {
          parent.children = parent.children.filter(id => id !== childId);
          await this.writeTaskToDB(parent);
        }
      }
    }
  }

  private async writeTaskToDB(task: Task): Promise<Result<void, IOError>> {
    if (!task.filepath) task.filepath = task.id + ".md";
    const md = Task.toMarkdown(task);

    try {
      // Create the .md file
      await this.db.put('files', { filepath: task.filepath, content: md });
    } catch (e) {
      return err(new IOError(`Failed to write ${task.filepath}`, e, md));
    }

    // Update the DB with the new file's data
    const updateRes = await this.updateIndexFromFile(task.filepath);
    if (updateRes.isErr()) {
      return err(updateRes.error);
    }
    return ok();
  }
  /**
   * @error {@link NotFoundError} if the file doesn't exist in the IndexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  private async updateIndexFromFile(filepath: string): Promise<Result<void, NotFoundError | ParseError>> {

    const file = await this.db.get('files', filepath);

    if (!file) {
      return err(new NotFoundError(filepath, "File"));
    }

    return Task.fromMarkdown(file.content, filepath).match(
      async task => {
        await this.db.put('index', task);
        return ok();
      },
      error => {
        return err(error);
      });
  }
  //#endregion
}