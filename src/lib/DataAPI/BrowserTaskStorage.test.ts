import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserTaskStorage } from './BrowserTaskStorage';
import { NotFoundError } from '$lib/Errors';
import 'fake-indexeddb/auto'
import type { TaskData } from './Task';
import type { ITaskStorage } from './types';
import type { TestIStorageImplementation } from './IStorage.test';

export const BrowserIStorageTest: TestIStorageImplementation<BrowserTaskStorage> = {
  name: "Browser",
  getInstance: async () => {
    return await BrowserTaskStorage.get();
  },
  beforeeach: async (storage: ITaskStorage) => {
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
  let storage: BrowserTaskStorage;

  beforeEach(async () => {
    // Clear all stores before each test
    storage = await BrowserTaskStorage.get();
    const db = await (storage as any).db;
    await db.clear('files');
    await db.clear('index');
  });

  // TODO rather than checking that updateIndexFromFile works, we should be checking that the behavior is correct 
  // (validating that both a file exists and the db has as task data in sync with the markdown)
  it('should update index from file', async () => {
    const task = sampleTask(idnext());
    const createRes = await storage.createTask(task);
    expect(createRes).toBeOk();
    const id = createRes._unsafeUnwrap();

    const result = await (storage as any).updateIndexFromFile(task.filepath);
    expect(result).toBeOk();

    // Optionally, check that the index store has the task
    const db = await (storage as any).db;
    const indexed = await db.get('index', id);
    expect(indexed).toMatchObject(task);
  });

  it('should return NotFoundError if updateIndexFromFile is called on missing file', async () => {
    const result = await (storage as any).updateIndexFromFile('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });
});

// describe('Integration', () => { });