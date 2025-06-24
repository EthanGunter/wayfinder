import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserStorage } from './BrowserStorage';
import { type TaskData, type EdgeData } from './types';
import { NotFoundError, ParseError } from '$lib/Errors/Errors';
import 'fake-indexeddb/auto'

function sampleTask(id: string): TaskData {
  return {
    id,
    filepath: `/tasks/${id}.md`,
    title: `Task ${id}`,
    content: 'Sample content',
    created: new Date().toISOString(),
    lastEdit: new Date().toISOString(),
  };
}

function sampleEdge(task: string, dependsOn: string): EdgeData {
  return { task, dependsOn };
}

describe('BrowserStorage', () => {
  let storage: BrowserStorage;

  beforeEach(async () => {
    // Clear all stores before each test
    storage = BrowserStorage.get();
    const db = await (storage as any).constructor.dbPromise;
    await db.clear('files');
    await db.clear('index');
    await db.clear('edges');
  });

  it('should create and read a node', async () => {
    const node = sampleTask('1');
    const createResult = await storage.createNode(node);
    expect(createResult.isOk()).toBe(true);

    const readResult = await storage.readNode('1');
    expect(readResult.isOk()).toBe(true);
    expect(readResult._unsafeUnwrap()).toMatchObject(node);
  });

  it('should return NotFoundError for missing node', async () => {
    const readResult = await storage.readNode('missing');
    expect(readResult.isErr()).toBe(true);
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('should update a node', async () => {
    const node = sampleTask('2');
    await storage.createNode(node);

    const updateResult = await storage.updateNode('2', { title: 'Updated Title' });
    expect(updateResult.isOk()).toBe(true);

    const readResult = await storage.readNode('2');
    expect(readResult.isOk()).toBe(true);
    expect(readResult._unsafeUnwrap().title).toBe('Updated Title');
  });

  it('should delete a node', async () => {
    const node = sampleTask('3');
    await storage.createNode(node);

    const deleteResult = await storage.deleteNode('3', false);
    expect(deleteResult.isOk()).toBe(true);

    const readResult = await storage.readNode('3');
    expect(readResult.isErr()).toBe(true);
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('deleteNode should succeed even if node does not exist', async () => {
    const deleteResult = await storage.deleteNode('nonexistent', false);
    expect(deleteResult.isOk()).toBe(true);
  });

  it('should create and read an edge', async () => {
    const edge = sampleEdge('a', 'b');
    const createResult = await storage.createEdge(edge);
    expect(createResult.isOk()).toBe(true);

    const readResult = await storage.readEdge('a');
    expect(readResult.isOk()).toBe(true);
    expect(readResult._unsafeUnwrap()).toMatchObject(edge);
  });

  it('should return NotFoundError for missing edge', async () => {
    const readResult = await storage.readEdge('missing');
    expect(readResult.isErr()).toBe(true);
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('should delete an edge', async () => {
    const edge = sampleEdge('x', 'y');
    await storage.createEdge(edge);

    const deleteResult = await storage.deleteEdge('x');
    expect(deleteResult.isOk()).toBe(true);

    const readResult = await storage.readEdge('x');
    expect(readResult.isErr()).toBe(true);
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('deleteEdge should succeed even if edge does not exist', async () => {
    const deleteResult = await storage.deleteEdge('nonexistent');
    expect(deleteResult.isOk()).toBe(true);
  });

  it('should update index from file', async () => {
    const node = sampleTask('idx');
    await storage.createNode(node);

    const result = await storage.updateIndexFromFile('idx');
    expect(result.isOk()).toBe(true);

    // Optionally, check that the index store has the node
    const db = await (storage as any).constructor.dbPromise;
    const indexed = await db.get('index', 'idx');
    expect(indexed).toMatchObject(node);
  });

  it('should return NotFoundError if updateIndexFromFile is called on missing file', async () => {
    const result = await storage.updateIndexFromFile('missing');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  // You can add more tests for ParseError, SSR, etc. as needed
});