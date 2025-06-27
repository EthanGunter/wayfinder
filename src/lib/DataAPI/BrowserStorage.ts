import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CreateTaskDTO, type IStorage } from './types';
import { err, ok, Result } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError, ArgumentError } from '$lib/Errors';
import { v4 } from 'uuid';
import { Task, type TaskData } from './TaskData';

interface MyDB extends DBSchema {
  files: {
    key: string;
    value: { filepath: string; content: string };
  };
  index: {
    key: string;
    value: TaskData;
  };
}

function TryGetIDFromFilepath(key: string): string {
  if (key.endsWith(".md")) {
    return key.split("/").slice(-1)[0].split(".")[0];
  }
  return key;
}

export class BrowserStorage implements IStorage {
  private db!: IDBPDatabase<MyDB>;

  private constructor() { }

  static async get(): Promise<BrowserStorage> {
    const storage = new BrowserStorage();
    storage.db = await openDB<MyDB>('wayfinder', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'filepath' });
        db.createObjectStore('index', { keyPath: 'id' });
      },
    });
    return storage;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  //#region Task Node Operations

  // 👍
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  async createTask(task: CreateTaskDTO): Promise<Result<string, IOError | ParseError>> {
    const preparedNode = task as TaskData;
    preparedNode.created = new Date().toISOString();
    preparedNode.id = v4();

    return (await this.writeTaskToDB(preparedNode)).match(
      success => {
        return ok(preparedNode.id);
      },
      error => err(error))
  }

  // 👍
  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the node id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async readTask(key: string): Promise<Result<TaskData, NotFoundError | ParseError>> {
    if (key.endsWith(".md")) {
      // Filepath
      // Get the .md file content
      const file = await this.db.get('files', key);
      if (!file) {
        return err(new NotFoundError(key, 'Node File').withTrace(1));
      }
      // Parse and return
      return Task.fromMarkdown(file.content, key);
    } else {
      // Task ID

      const node = await this.db.get('index', key);
      if (!node) {
        return err(new NotFoundError(key, 'Node').withTrace(1));
      }
      return ok(node);
    }
  }

  // 👍
  /**
   * @param key Either a filepath or ID. If a task ID is passed, an attempt to generate the filepath is made, but it's not foolproof
   * @error {@link NotFoundError} if the task id doesn't exist
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async updateTask(key: string, updates: Partial<TaskData>): Promise<Result<TaskData, NotFoundError | IOError | ParseError>> {
    return (await this.readTask(key)).match(
      async node => {
        const updated: TaskData = { ...node, ...updates, lastEdit: new Date().toISOString() };
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
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  async deleteTask(key: string, recursive: boolean): Promise<Result<void, Err>> {
    key = TryGetIDFromFilepath(key);

    const node = await this.db.get('index', key);
    const all = await this.db.getAll("index");

    if (node) {
      try {
        await this.db.delete('files', node.filepath);
        await this.db.delete('index', key);
      } catch (e) {// TODO Throw an error during development/testing ONLY
        throw new IOError("Delete", key, e);
      }

    }

    return ok();
  }

  // #endregion


  //#region Utilities

  async writeTaskToDB(task: TaskData): Promise<Result<void, IOError>> {
    
    const md = Task.toMarkdown(task);

    try {
      // Create the .md file
      await this.db.put('files', { filepath: task.filepath, content: md });
    } catch (e) {
      return err(new IOError("Write", `Task: ${task.title}`, md, e));
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
      async node => {
        await this.db.put('index', node);
        return ok();
      },
      error => {
        return err(error);
      });
  }

  //#endregion
}