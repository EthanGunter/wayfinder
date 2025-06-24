import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { markdownToNode, nodeToMarkdown } from './MarkdownConverters';
import { type IStorage, type TaskData } from './types';
import { err, ok, Result } from 'neverthrow';
import { NotFoundError, Err, ParseError, IOError } from '$lib/Errors/Errors';

interface MyDB extends DBSchema {
  files: {
    key: string;
    value: { id: string; content: string };
  };
  index: {
    key: string;
    value: TaskData;
  };
}

export class BrowserStorage implements IStorage {
  private static instance: BrowserStorage;
  private static dbPromise: Promise<IDBPDatabase<MyDB>>;

  public static get() {
    if (typeof window == 'undefined' && typeof indexedDB == 'undefined') throw new Error("Data APIs can only operate in a browser environment (is this running in server-rendered code?)");

    if (!BrowserStorage.instance) {
      BrowserStorage.dbPromise = openDB<MyDB>('wayfinder', 1, {
        upgrade(db) {
          db.createObjectStore('files', { keyPath: 'id' });
          db.createObjectStore('index', { keyPath: 'id' });
        },
      });
      BrowserStorage.instance = new BrowserStorage();
    }

    return BrowserStorage.instance;
  }
  //#region Task Node Operations

  // 👍
  /**
   * @error {@link NotFoundError}, {@link ParseError} if trouble syncing the created file with the indexed db
   * @error {@link IOError} if the IndexedDB.put() attempt fails
   */
  async createNode(node: Omit<TaskData, "created">): Promise<Result<void, IOError | NotFoundError | ParseError>> {
    const db = await BrowserStorage.dbPromise;
    const datedNode = node as TaskData;
    datedNode.created = new Date().toISOString();

    const md = nodeToMarkdown(datedNode);
    console.log(md);

    try {
      // Create the .md file
      await db.put('files', { id: node.id, content: md });
    } catch (e) {
      return err(new IOError("Write", node.id, e));
    }

    // Update the DB with the new file's data
    return await this.updateIndexFromFile(node.id);
  }

  // 👍
  /**
   * @error {@link NotFoundError} if the node id doesn't exist in the indexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async readNode(id: string): Promise<Result<TaskData, NotFoundError | ParseError>> {
    const db = await BrowserStorage.dbPromise;

    // Get the .md file content
    const file = await db.get('files', id);
    if (!file) {
      return err(new NotFoundError(id, 'Node'));
    }

    // Parse and return
    return markdownToNode(file.content);
  }

  // 👍
  /**
   * @error {@link IOError} if IndexedDB.put() fails
   * @error {@link UpdateIndexErr} if syncing the file with the indexed db fails
   */
  async updateNode(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, Err>> {
    return (await this.readNode(id)).match(
      async node => {
        const updated: TaskData = { ...node, ...updates, lastEdit: new Date().toISOString() };
        return (await this.createNode(updated)).match(
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
   * @error {@link IOError} if IndexedDB.delete() fails
   */
  async deleteNode(id: string, recursive: boolean): Promise<Result<void, Err>> {
    const db = await BrowserStorage.dbPromise;
    await db.delete('files', id);
    await db.delete('index', id);

    return ok();
  }

  // #endregion
  

  /**
   * @error {@link NotFoundError} if the file doesn't exist in the IndexedDB
   * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
   */
  async updateIndexFromFile(fileID: string): Promise<Result<void, NotFoundError | ParseError>> {
    const db = await BrowserStorage.dbPromise;
    const file = await db.get('files', fileID);

    if (!file) {
      return err(new NotFoundError(fileID, "File"));
    }

    return markdownToNode(file.content).match(
      async node => {
        await db.put('index', node);
        return ok();
      },
      error => {
        return err(error);
      });
  }
}