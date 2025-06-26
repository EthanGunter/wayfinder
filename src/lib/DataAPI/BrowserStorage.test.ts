import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserStorage } from './BrowserStorage';
import { Err, NotFoundError, ParseError } from '$lib/Errors';
import 'fake-indexeddb/auto'
import type { TaskData } from './TaskData';
import type { Result } from 'neverthrow';

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
    const db = await (storage as any).dbPromise;
    await db.clear('files');
    await db.clear('index');
  });

  it('should create and read a node', async () => {
    const createData = sampleTask(idnext());
    const createResult = await storage.createNode(createData);
    expect(createResult).toBeOk();
    const id = createResult._unsafeUnwrap();

    const readResult = await storage.readNode(id);
    expect(readResult).toBeOk();

    const node = readResult._unsafeUnwrap();
    expect(node).toMatchObject(createData);
  });

  it('should return NotFoundError for missing node', async () => {
    const readResult = await storage.readNode('missing');
    expect(readResult).toErr();
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('should update a node', async () => {
    const node = sampleTask(idnext());
    const createRes = await storage.createNode(node);
    const id = createRes._unsafeUnwrap();

    const updateResult = await storage.updateNode(id, { title: 'Updated Title' });
    expect(updateResult).toBeOk();

    const readResult = await storage.readNode(id);
    expect(readResult).toBeOk();
    expect(readResult._unsafeUnwrap().title).toBe('Updated Title');
  });

  it('should delete a node', async () => {
    const node = sampleTask(idnext());
    const createRes = await storage.createNode(node);

    const genId = createRes._unsafeUnwrap();

    const deleteResult = await storage.deleteNode(genId, false);
    expect(deleteResult).toBeOk();

    const readResult = await storage.readNode(genId);
    expect(readResult).toErr();

    const error = readResult._unsafeUnwrapErr();

    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('deleteNode should succeed even if node does not exist', async () => {
    const deleteResult = await storage.deleteNode('nonexistent', false);
    expect(deleteResult).toBeOk();
  });

  it('should update index from file', async () => {
    const node = sampleTask(idnext());
    const createRes = await storage.createNode(node);
    expect(createRes).toBeOk();
    const id = createRes._unsafeUnwrap();

    const result = await (storage as any).updateIndexFromFile(node.filepath);
    expect(result).toBeOk();

    // Optionally, check that the index store has the node
    const db = await (storage as any).dbPromise;
    const indexed = await db.get('index', id);
    expect(indexed).toMatchObject(node);
  });

  it('should return NotFoundError if updateIndexFromFile is called on missing file', async () => {
    const result = await (storage as any).updateIndexFromFile('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  // You can add more tests for ParseError, SSR, etc. as needed
});

describe('Integration', () => { });