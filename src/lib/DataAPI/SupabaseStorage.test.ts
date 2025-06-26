import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { SupabaseStorage } from './SupabaseStorage';
import { NotFoundError } from '$lib/Errors';
import type { TaskData } from './TaskData';
import type { CreateTaskDTO } from './types';
import { v4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';

function sampleTask(title: string): CreateTaskDTO {
  return {
    filepath: `${title}.md`,
    title,
    content: 'Sample content',
  };
}

describe('Unit', () => {
  let storage: SupabaseStorage;

  beforeEach(async () => {
    storage = new SupabaseStorage();
  });
  afterEach(async () => {
    await storage.close();
  });

  afterAll(async () => {
    // Clean up after tests
    const { client } = (storage as any as { client: SupabaseClient });
    await client.from('tasks').delete().not('id', 'is', null);
    await storage.close();
  })

  it('should create a node and return its id', async () => {
    const task = sampleTask("should create a node and return its id");
    const result = await storage.createNode(task);
    expect(result).toBeOk();
    const createdId = result._unsafeUnwrap();
    expect(typeof createdId).toBe('string');
  });

  it('should read a node by id', async () => {
    const task = sampleTask("should read a node by id");
    const result = await storage.createNode(task);
    expect(result).toBeOk();
    const createdId = result._unsafeUnwrap();

    const readResult = await storage.readNode(createdId);
    expect(readResult).toBeOk();
    const node = readResult._unsafeUnwrap();
    expect(node.filepath).toBe(task.filepath);
    expect(node.title).toBe(task.title);
  });

  it('should return NotFoundError for missing node', async () => {
    const readResult = await storage.readNode('nonexistent-id');
    expect(readResult).toErr();
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('should update a node', async () => {
    const task = sampleTask("should update a node");
    const createResult = await storage.createNode(task);
    const createdId = createResult._unsafeUnwrap();
    const updateResult = await storage.updateNode(createdId, { title: 'Updated Title' });
    expect(updateResult).toBeOk();
    const updated = updateResult._unsafeUnwrap();
    expect(updated.title).toBe('Updated Title');
  });

  it('should update a node with partial data', async () => {
    const task = sampleTask("should update a node with partial data");
    const createResult = await storage.createNode(task);
    const createdId = createResult._unsafeUnwrap();
    const updateResult = await storage.updateNode(createdId, { content: 'New content' });
    expect(updateResult).toBeOk();
    const updated = updateResult._unsafeUnwrap();
    expect(updated.content).toBe('New content');
    expect(updated.title).toBe(task.title);
  });

  it('should delete a node', async () => {
    const task = sampleTask("should delete a node");
    const createResult = await storage.createNode(task);
    const createdId = createResult._unsafeUnwrap();
    const deleteResult = await storage.deleteNode(createdId, false);
    expect(deleteResult).toBeOk();

    // Should not find the node anymore
    const readResult = await storage.readNode(createdId);
    expect(readResult).toErr();
    expect(readResult._unsafeUnwrapErr()).toBeInstanceOf(NotFoundError);
  });

  it('deleteNode should succeed even if node does not exist', async () => {
    const deleteResult = await storage.deleteNode(v4(), false);
    expect(deleteResult).toBeOk();
  });

  it('should close the storage without error', async () => {
    await expect(storage.close()).resolves.not.toThrow();
  });

  // If you have an updateIndexFromFile or similar, add tests for it here
  // If you have parse error scenarios, add tests for them here
});

describe('Integration', () => { });
