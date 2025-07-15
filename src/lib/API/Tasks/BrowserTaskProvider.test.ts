import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest';
import browserTaskProvider, { db, updateIndexFromFile } from './BrowserTaskProvider';
import { NotFoundError } from '$lib/Errors';
import { TaskStatus, type TaskData } from './Task';
import type { ITaskProvider } from './types';
import type { TestIStorageImplementation } from './ITaskProvider.test';

export const BrowserITaskProviderTest: TestIStorageImplementation = {
  name: "Browser",
  getInstance: async () => {
    return await browserTaskProvider.get();
  },
  beforeeach: async (provider: ITaskProvider) => {
    if (db) {
      // Clear all stores before each test
      await db.clear('files');
      await db.clear('index');
    } else throw new Error("DB not available to clear");
  },
}

function sampleTask(id: string): TaskData {
  return {
    id,
    filepath: `${id}.md`,
    title: `Task ${id}`,
    content: 'Sample content',
    created: new Date().toISOString(),
    last_edit: new Date().toISOString(),
    status: TaskStatus.incomplete
  };
}

let _id = 0;
const idnext = () => { _id++; return _id.toString(); }

describe('Unit', () => {
  let provider: ITaskProvider;

  beforeEach(async () => {
    if (db) {
      // Clear all stores before each test
      provider = await browserTaskProvider.get();
      await db.clear('files');
      await db.clear('index');
    } else throw new Error("DB not available");
  });

  // TODO rather than checking that updateIndexFromFile works, we should be checking that the behavior is correct 
  // (validating that both a file exists and the db has as task data in sync with the markdown)
  it('should update index from file', async () => {
    const task = sampleTask(idnext());
    const createRes = await provider.createTask(task);
    expect(createRes).toBeOk();
    const id = createRes._unsafeUnwrap();

    const result = await updateIndexFromFile(task.filepath);
    expect(result).toBeOk();

    // Optionally, check that the index store has the task
    const indexed = await db!.get('index', id);
    expect(indexed).toMatchObject(task);
  });

  it('should return NotFoundError if updateIndexFromFile is called on missing file', async () => {
    const result = await updateIndexFromFile('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });
});

// describe('Integration', () => { });