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
  private dbPromise: Promise<IDBPDatabase<MyDB>>;

  private constructor() {
    this.dbPromise = openDB<MyDB>('wayfinder', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'filepath' });
        db.createObjectStore('index', { keyPath: 'id' });
      },
    });
  }

  static get(): BrowserStorage {
    return new BrowserStorage();
  }

  async close(): Promise<void> {
    (await this.dbPromise).close();
  }

  //#region Task Node Operations

  // 👍
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  async createNode(task: CreateTaskDTO): Promise<Result<string, IOError | ParseError>> {
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
  async readNode(key: string): Promise<Result<TaskData, NotFoundError | ParseError>> {
    const db = await this.dbPromise;

    if (key.endsWith(".md")) {
      // Filepath
      // Get the .md file content
      const file = await db.get('files', key);
      if (!file) {
        return err(new NotFoundError(key, 'Node File').withTrace(1));
      }
      // Parse and return
      return Task.fromMarkdown(file.content, key);
    } else {
      // Task ID

      const node = await db.get('index', key);
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
  async updateNode(key: string, updates: Partial<TaskData>): Promise<Result<TaskData, NotFoundError | IOError | ParseError>> {
    return (await this.readNode(key)).match(
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
  async deleteNode(key: string, recursive: boolean): Promise<Result<void, Err>> {
    key = TryGetIDFromFilepath(key);

    const db = await this.dbPromise;
    const node = await db.get('index', key);
    const all = await db.getAll("index");

    if (node) {
      try {
        await db.delete('files', node.filepath);
        await db.delete('index', key);
      } catch (e) {// TODO Throw an error during development/testing ONLY
        throw new IOError("Delete", key, e);
      }

    }

    return ok();
  }

  // #endregion


  //#region Utilities

  async writeTaskToDB(task: TaskData): Promise<Result<void, IOError>> {
    const db = await this.dbPromise;
    const md = Task.toMarkdown(task);

    try {
      // Create the .md file
      await db.put('files', { filepath: task.filepath, content: md });
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
    const db = await this.dbPromise;
    const file = await db.get('files', filepath);

    if (!file) {
      return err(new NotFoundError(filepath, "File"));
    }

    return Task.fromMarkdown(file.content, filepath).match(
      async node => {
        await db.put('index', node);
        return ok();
      },
      error => {
        return err(error);
      });
  }

  //#endregion
}