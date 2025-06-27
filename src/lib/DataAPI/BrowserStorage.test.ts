import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserStorage } from './BrowserStorage';
import { NotFoundError } from '$lib/Errors';
import 'fake-indexeddb/auto'
import type { TaskData } from './TaskData';
import type { IStorage } from './types';
import type { TestIStorageImplementation } from './IStorage.test';

export const BrowserIStorageTest: TestIStorageImplementation<BrowserStorage> = {
  name: "Browser",
  getInstance: async () => {
    return await BrowserStorage.get();
  },
  beforeeach: async (storage: IStorage) => {
    // Clear all stores before each test
    const db = await (storage as any).db;
    await db.clear('files');
    await db.clear('index');
  },
}

function sampleTask(id: string): TaskData {
  return {
    id,
    filepath: `${id}.md`,
    title: `Task ${id}`,
    content: 'Sample content',
    created: new Date().toISOString(),
    lastEdit: new Date().toISOString(),
  };
}

let _id = 0;
const idnext = () => { _id++; return _id.toString(); }

describe('Unit', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    // Clear all stores before each test
    storage = await BrowserStorage.get();
    const db = await (storage as any).db;
    await db.clear('files');
    await db.clear('index');
  });

  it('should update index from file', async () => {
    const node = sampleTask(idnext());
    const createRes = await storage.createTask(node);
    expect(createRes).toBeOk();
    const id = createRes._unsafeUnwrap();

    const result = await (storage as any).updateIndexFromFile(node.filepath);
    expect(result).toBeOk();

    // Optionally, check that the index store has the node
    const db = await (storage as any).db;
    const indexed = await db.get('index', id);
    expect(indexed).toMatchObject(node);
  });

  it('should return NotFoundError if updateIndexFromFile is called on missing file', async () => {
    const result = await (storage as any).updateIndexFromFile('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });
});

// describe('Integration', () => { });