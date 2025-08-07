import 'fake-indexeddb/auto'
import { describe, it, beforeEach, beforeAll, assert, expect, vi, type MockInstance } from 'vitest';
import type { CreateTaskParams, ITasks, ITasksLocal, TaskSyncQueue } from './types';
import { APP_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { TASK_TABLE_NAME, AUTH_TABLE_NAME } from '../SupabaseClient';
import BrowserTaskProvider from './BrowserTaskProvider';
import { mock, type MockProxy } from 'vitest-mock-extended';
import type { LocalUser } from '../Auth/types';
import { extractBatch, okBatch } from '../types';
import { Err, ErrorType, NotImplementedError } from '$lib/Errors';
import { err, ok } from 'neverthrow';


//#region Setup

let db: LocalDB;
let mockRemoteTasks: MockProxy<ITasks>;
let syncAddSpy: MockInstance;
let tasks: ITasksLocal;

const user1: LocalUser = {
  id: "User1",
  last_active: new Date(),
}
const user2: LocalUser = {
  id: "User2",
  last_active: new Date(),
}

function taskDetail(userId?: string, id?: string): CreateTaskParams {
  return {
    id,
    title: `${userId} - Test Task`,
    user_id: userId ?? user1.id,
  }
}

beforeAll(async () => {
  db = await dbPromise;
});
beforeEach(async () => {
  mockRemoteTasks = mock<ITasks>();
  tasks = await BrowserTaskProvider.get(mockRemoteTasks);

  let syncQueue = tasks.getSyncQueue()!;
  syncAddSpy = vi.spyOn(syncQueue, 'add');
  assert(!!syncAddSpy);

  if (db) {
    // Clear all stores before each test
    await db.clear(APP_TABLE_NAME);
    await db.clear(TASK_TABLE_NAME);
    await db.clear(AUTH_TABLE_NAME);
  } else throw new Error("DB not available to clear");
});

//#endregion

// TODO:test verify relationship behavior of create, update, delete, and their response handlers
// TODO:test Modify syncQueue tests to ensure it survives app shutdown (serializes and deserializes correctly)
describe('ITaskCore', () => {
  describe('createTasks', () => {
    it('creates multiple tasks and returns their details', async () => {
      // Arrange
      const createDetails = [
        taskDetail(user1.id),
        taskDetail(user2.id)
      ]

      // Act
      const result = await tasks.createTasks({ createDetails });
      expect(result).toBeOk();

      // Assert
      const [good, bad] = extractBatch(result);
      expect(good.length).toBe(2);
      expect(bad.length).toBe(0);
      expect(good[0].user_id).toBe(user1.id);
      expect(good[0].id).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(good[1].user_id).toBe(user2.id);
    });
    it('queues the create operation in the sync queue', async () => {
      // Arrange
      const createDetails = [taskDetail(undefined, user1.id)];

      // Act
      await tasks.createTasks({ createDetails });

      // Assert
      // The syncQueue should have been called with a create op
      expect(syncAddSpy).toBeCalledTimes(1);
      console.log(syncAddSpy.mock.calls[0]);

      const [queuedOp, args, handler, errorArgs] = syncAddSpy.mock.calls[0];
      expect(queuedOp).toBe('createTasks');
    });
    it('handles and reports failures for invalid or duplicate tasks', async () => {
      // Arrange
      const createDetails = [
        taskDetail(user1.id, "duplicate-id"),
        taskDetail(user2.id, "duplicate-id"),
      ]

      // Act
      // First, create a task to cause a duplicate
      const result = await tasks.createTasks({ createDetails });
      expect(result).toBeOk();
      const [good, bad] = extractBatch(result);

      // Assert
      expect(good.length).toBeLessThan(2);
      expect(bad.length).toBeGreaterThan(0);
      // At least one failure is for invalid data
      expect(bad.some(f => f.type === ErrorType.ArgumentError)).toBe(true);
    });
  });
  describe('getTasks', () => {
    it('fetches multiple tasks by their IDs', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id), taskDetail(user2.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const ids = good.map(t => t.id);

      // Act
      const result = await tasks.getTasks({ ids });
      expect(result).toBeOk();
      const [found, notFound] = extractBatch(result);

      // Assert
      expect(found.length).toBe(2);
      expect(notFound.length).toBe(0);
      expect(found[0].id).toBe(ids[0]);
      expect(found[1].id).toBe(ids[1]);
    });
    it('returns NotFoundError for missing IDs', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const validId = good[0].id;
      const missingId = 'non-existent-id';

      // Act
      const result = await tasks.getTasks({ ids: [validId, missingId] });
      expect(result).toBeOk();
      const [found, notFound] = extractBatch(result);

      // Assert
      expect(found.length).toBe(1);
      expect(notFound.length).toBe(1);
      expect(found[0].id).toBe(validId);
      expect(notFound[0].type).toBe(ErrorType.NotFoundError);
    });
    it('returns an empty array if no IDs are provided', async () => {
      // Act
      const result = await tasks.getTasks({ ids: [] });
      expect(result).toBeOk();
      const [found, notFound] = extractBatch(result);

      // Assert
      expect(found.length).toBe(0);
      expect(notFound.length).toBe(0);
    });
  });
  describe('getAllUserTasks', () => {
    it('returns all tasks for a given user', async () => {
      // Arrange
      const createDetails = [
        taskDetail(user1.id),
        taskDetail(user1.id),
        taskDetail(user2.id)
      ];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const user1Tasks = good.filter(t => t.user_id === user1.id);

      // Act
      const result = await tasks.getAllUserTasks({ userId: user1.id });
      expect(result).toBeOk();
      const [found, notFound] = extractBatch(result);

      // Assert
      expect(found.length).toBe(user1Tasks.length);
      expect(found.every(t => t.user_id === user1.id)).toBe(true);
      expect(notFound.length).toBe(0);
    });
    it('returns an empty array if the user has no tasks', async () => {
      // Act
      const result = await tasks.getAllUserTasks({ userId: 'no-such-user' });
      expect(result).toBeOk();
      const [found, notFound] = extractBatch(result);

      // Assert
      expect(found.length).toBe(0);
      expect(notFound.length).toBe(0);
    });
  });
  describe('updateTasks', () => {
    it('updates multiple tasks with new data', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id), taskDetail(user2.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const updates = good.map(task => ({
        taskOrId: task.id,
        changes: { title: `Updated ${task.title}` }
      }));

      // Act
      const result = await tasks.updateTasks({ updates });
      expect(result).toBeOk();
      const [updated, failed] = extractBatch(result);

      // Assert
      expect(updated.length).toBe(2);
      expect(failed.length).toBe(0);
      expect(updated[0].title).toMatch(/^Updated/);
      expect(updated[1].title).toMatch(/^Updated/);
    });
    it('queues the update operation in the sync queue', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const updates = [{ taskOrId: good[0].id, changes: { title: 'New Title' } }];
      expect(syncAddSpy).toBeCalledTimes(1); // create + update

      // Act
      await tasks.updateTasks({ updates });

      // Assert
      expect(syncAddSpy).toBeCalledTimes(2); // create + update
      const [queuedOp, args, handler, errorArgs] = syncAddSpy.mock.calls[1];
      expect(queuedOp).toBe('updateTasks');
    });
    it('handles and reports failures for non-existent tasks', async () => {
      // Arrange
      const updates = [
        { taskOrId: 'non-existent-id', changes: { title: 'Should Fail' } }
      ];

      // Act
      const result = await tasks.updateTasks({ updates });
      expect(result).toBeOk();
      const [updated, failed] = extractBatch(result);

      // Assert
      expect(updated.length).toBe(0);
      expect(failed.length).toBe(1);
      expect(failed[0].type).toBe(ErrorType.NotFoundError);
    });
    it.todo('allows task ids to be changed'); // ??
  });
  describe('deleteTasks', () => {
    it('deletes multiple tasks by their IDs', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id), taskDetail(user2.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const deleteArgs = good.map(t => ({ taskOrId: t.id }));

      // Act
      const result = await tasks.deleteTasks({ deleteArgs });
      expect(result).toBeOk();

      // Assert
      // Try to fetch the deleted tasks
      const getResult = await tasks.getTasks({ ids: good.map(t => t.id) });
      expect(getResult).toBeOk();
      const [found, notFound] = extractBatch(getResult);
      expect(found.length).toBe(0);
      expect(notFound.length).toBe(2);
      expect(notFound.every(e => e.type === ErrorType.NotFoundError)).toBe(true);
    });
    it('queues the delete operation in the sync queue', async () => {
      // Arrange
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [good] = extractBatch(createResult);
      const deleteArgs = [{ taskOrId: good[0].id }];
      expect(syncAddSpy).toBeCalledTimes(1); // create

      // Act
      await tasks.deleteTasks({ deleteArgs });

      // Assert
      expect(syncAddSpy).toBeCalledTimes(2); // create + delete
      const [queuedOp, args, handler, errorArgs] = syncAddSpy.mock.calls[1];
      expect(queuedOp).toBe('deleteTasks');
    });
    it('handles recursive deletion if specified', async () => {
      // Arrange: create parent, middle, and child tasks with relationships
      const parentDetail = taskDetail(user1.id, 'parent');
      const middleDetail = { ...taskDetail(user1.id, 'middle'), parents: ['parent'] };
      const childDetail = { ...taskDetail(user1.id, 'child'), parents: ['middle'] };
      const descendantDetail = { ...taskDetail(user1.id, 'descendant'), parents: ['child'] };

      const createDetails = [parentDetail, middleDetail, childDetail, descendantDetail];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();

      // Confirm all tasks exist
      const ids = ['parent', 'middle', 'child', 'descendant'];
      let getResult = await tasks.getTasks({ ids });
      expect(getResult).toBeOk();
      let [found, notFound] = extractBatch(getResult);
      expect(found.length).toBe(4);

      // Act: delete the middle task recursively
      const deleteArgs = [{ taskOrId: 'middle', recursive: true }];
      const result = await tasks.deleteTasks({ deleteArgs });

      // Assert: parent should exist, middle and child should be deleted
      getResult = await tasks.getTasks({ ids });
      expect(getResult).toBeOk();
      [found, notFound] = extractBatch(getResult);
      expect(found.length).toBe(1);
      expect(found[0].id).toBe('parent');
      expect(notFound.length).toBe(3);
      expect(notFound.map(e => e.type)).toEqual([ErrorType.NotFoundError, ErrorType.NotFoundError, ErrorType.NotFoundError]);
    });
  });
  describe('changeOwnership', () => {
    it('transfers all tasks from one user to another', async () => {
      // Arrange: create tasks for user1
      const createDetails = [taskDetail(user1.id), taskDetail(user1.id), taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [created] = extractBatch(createResult);
      expect(created.length).toBe(3);

      // Act: transfer ownership from user1 to user2
      const changeResult = await tasks.changeOwnership({ oldUserID: user1.id, newUserID: user2.id });
      expect(changeResult).toBeOk();
      const [transferred] = extractBatch(changeResult);

      // Assert: all transferred tasks now belong to user2
      expect(transferred.length).toBe(3);
      expect(transferred.every(t => t.user_id === user2.id)).toBe(true);

      // Assert: user1 has no tasks
      const user1TasksResult = await tasks.getAllUserTasks({ userId: user1.id });
      expect(user1TasksResult).toBeOk();
      const [user1Tasks] = extractBatch(user1TasksResult);
      expect(user1Tasks.length).toBe(0);

      // Assert: user2 has all the tasks
      const user2TasksResult = await tasks.getAllUserTasks({ userId: user2.id });
      expect(user2TasksResult).toBeOk();
      const [user2Tasks] = extractBatch(user2TasksResult);
      expect(user2Tasks.length).toBeGreaterThanOrEqual(3);
      expect(user2Tasks.filter(t => created.map(c => c.id).includes(t.id)).length).toBe(3);
    });
    it('queues the changeOwnership operation in the sync queue', async () => {
      // Arrange: create tasks for user1
      const createDetails = [taskDetail(user1.id)];
      await tasks.createTasks({ createDetails });
      expect(syncAddSpy).toBeCalledTimes(1); // create

      // Act: transfer ownership
      await tasks.changeOwnership({ oldUserID: user1.id, newUserID: user2.id });

      // Assert: sync queue should have been called for changeOwnership
      expect(syncAddSpy).toBeCalledTimes(2); // create + changeOwnership
      const [queuedOp, args, handler, errorArgs] = syncAddSpy.mock.calls[1];
      expect(queuedOp).toBe('changeOwnership');
      expect(args).toEqual({ oldUserID: user1.id, newUserID: user2.id });

      // Assert: Hasn't called the server again
      expect(syncAddSpy).toBeCalledTimes(2);
    });
  });
});

describe('ITaskCoreResponseHandler', () => {
  describe('handleCreateTasksResponse', () => {
    it('undoes or cleans up after failed create operations', async () => {
      // Arrange: mock remote createTasks to always fail
      mockRemoteTasks.createTasks.mockResolvedValue(err(new NotImplementedError("TEST")));
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [created] = extractBatch(createResult);
      expect(created.length).toBe(1);
      const createdId = created[0].id;

      // Confirm task exists locally before sync
      const getResultBefore = await tasks.getTasks({ ids: [createdId] });
      expect(getResultBefore).toBeOk();
      const [foundBefore] = extractBatch(getResultBefore);
      expect(foundBefore.length).toBe(1);

      // Act: process the sync queue (should trigger handler and rollback)
      const syncQueue = tasks.getSyncQueue();
      await syncQueue!.process();

      // Assert: task should be removed from local DB after failed sync
      const getResultAfter = await tasks.getTasks({ ids: [createdId] });
      expect(getResultAfter).toBeOk();
      const [foundAfter, notFoundAfter] = extractBatch(getResultAfter);
      expect(foundAfter.length).toBe(0);
      expect(notFoundAfter.length).toBe(1);

      // Assert: Hasn't called the server again
      expect(syncAddSpy).toBeCalledTimes(1);
    });
  });

  describe('handleUpdateTasksResponse', () => {
    it('undoes or cleans up after failed update operations', async () => {
      // Arrange: create a task
      mockRemoteTasks.updateTasks.mockResolvedValue(err(new NotImplementedError("TEST")));
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [created] = extractBatch(createResult);
      expect(created.length).toBe(1);
      const createdId = created[0].id;
      const originalTitle = created[0].title;
      mockRemoteTasks.createTasks.mockResolvedValue(okBatch(created));

      // Update the task
      const updates = [{ taskOrId: createdId, changes: { title: 'Updated Title' } }];
      const updateResult = await tasks.updateTasks({ updates });
      expect(updateResult).toBeOk();
      const [updated] = extractBatch(updateResult);
      expect(updated.length).toBe(1);
      expect(updated[0].title).toBe('Updated Title');

      // Act: process the sync queue (should trigger handler and rollback)
      const syncQueue = tasks.getSyncQueue();
      await syncQueue!.process();

      // Assert: task should be rolled back to original title
      const getResult = await tasks.getTasks({ ids: [createdId] });
      expect(getResult).toBeOk();
      const [found] = extractBatch(getResult);
      expect(found.length).toBe(1);
      expect(found[0].title).toBe(originalTitle);

      // Assert: Hasn't called the server again
      expect(syncAddSpy).toBeCalledTimes(2);
    });
  });

  describe('handleDeleteTasksResponse', () => {
    it('resets after failed delete operations', async () => {
      // Arrange: create a task
      mockRemoteTasks.deleteTasks.mockResolvedValue(err(new NotImplementedError("TEST")));
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [created] = extractBatch(createResult);
      expect(created.length).toBe(1);
      const createdId = created[0].id;
      mockRemoteTasks.createTasks.mockResolvedValue(okBatch(created));

      // Delete the task
      const deleteArgs = [{ taskOrId: createdId }];
      const deleteResult = await tasks.deleteTasks({ deleteArgs });
      expect(deleteResult).toBeOk();

      // Act: process the sync queue (should trigger handler and rollback)
      const syncQueue = tasks.getSyncQueue();
      await syncQueue!.process();

      // Assert: task should still exist locally after failed sync
      const getResult = await tasks.getTasks({ ids: [createdId] });
      expect(getResult).toBeOk();
      const [found] = extractBatch(getResult);
      expect(found.length).toBe(1);
      expect(found[0].id).toBe(createdId);

      // Assert: Hasn't called the server again
      expect(syncAddSpy).toBeCalledTimes(2);
    });
  });

  describe('handleChangeOwnershipResponse', () => {
    it('undoes or cleans up after failed ownership change operations', async () => {
      // Arrange: create a task for user1
      mockRemoteTasks.changeOwnership.mockResolvedValue(err(new NotImplementedError("TEST")));
      const createDetails = [taskDetail(user1.id)];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();
      const [created] = extractBatch(createResult);
      expect(created.length).toBe(1);
      const createdId = created[0].id;
      mockRemoteTasks.createTasks.mockResolvedValue(okBatch(created));

      // Change ownership to user2
      await tasks.changeOwnership({ oldUserID: user1.id, newUserID: user2.id });

      // Act: process the sync queue (should trigger handler and rollback)
      const syncQueue = tasks.getSyncQueue();
      await syncQueue!.process();

      // Assert: task should still belong to user1 after failed sync
      const getResult = await tasks.getTasks({ ids: [createdId] });
      expect(getResult).toBeOk();
      const [found] = extractBatch(getResult);
      expect(found.length).toBe(1);
      expect(found[0].user_id).toBe(user1.id);

      // Assert: Hasn't called the server again
      expect(syncAddSpy).toBeCalledTimes(2);
    });
  });
});

describe('ITaskRelations', () => {
  describe('getChildrenOf', () => {
    it('returns all child tasks for a given task', async () => {
      // Arrange: parent -> child1, child2
      const parent = taskDetail(user1.id, 'parent');
      const child1 = { ...taskDetail(user1.id, 'child1'), parents: ['parent'] };
      const child2 = { ...taskDetail(user1.id, 'child2'), parents: ['parent'] };
      const createDetails = [parent, child1, child2];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getChildrenOf({ taskOrId: 'parent' });
      assert(result.isOk());
      const children = result.value;

      // Assert
      expect(children.length).toBe(2);
      const childIds = children.map(t => t.id);
      expect(childIds).toContain('child1');
      expect(childIds).toContain('child2');
    });

    it('returns an empty array if there are no children', async () => {
      // Arrange: single task, no children
      const parent = taskDetail(user1.id, 'parent');
      const createResult = await tasks.createTasks({ createDetails: [parent] });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getChildrenOf({ taskOrId: 'parent' });
      assert(result.isOk());
      const children = result.value;

      // Assert
      expect(children.length).toBe(0);
    });
  });

  describe('getParentsOf', () => {
    it('returns all parent tasks for a given task', async () => {
      // Arrange: parent1, parent2 -> child
      const parent1 = taskDetail(user1.id, 'parent1');
      const parent2 = taskDetail(user1.id, 'parent2');
      const child = { ...taskDetail(user1.id, 'child'), parents: ['parent1', 'parent2'] };
      const createDetails = [parent1, parent2, child];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getParentsOf({ taskOrId: 'child' });
      assert(result.isOk());
      const parents = result.value;

      // Assert
      expect(parents.length).toBe(2);
      const parentIds = parents.map(t => t.id);
      expect(parentIds).toContain('parent1');
      expect(parentIds).toContain('parent2');
    });

    it('returns an empty array if there are no parents', async () => {
      // Arrange: single task, no parents
      const orphan = taskDetail(user1.id, 'orphan');
      const createResult = await tasks.createTasks({ createDetails: [orphan] });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getParentsOf({ taskOrId: 'orphan' });
      assert(result.isOk());
      const parents = result.value;

      // Assert
      expect(parents.length).toBe(0);
    });
  });

  describe('getRootTasks', () => {
    it('returns all tasks with no parents (root tasks)', async () => {
      // Arrange: root1, root2, child (child has parent root1)
      const root1 = taskDetail(user1.id, 'root1');
      const root2 = taskDetail(user1.id, 'root2');
      const child = { ...taskDetail(user1.id, 'child'), parents: ['root1'] };
      const createDetails = [root1, root2, child];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getRootTasks();
      assert(result.isOk());
      const roots = result.value;

      // Assert
      const rootIds = roots.map(t => t.id);
      expect(rootIds).toContain('root1');
      expect(rootIds).toContain('root2');
      expect(rootIds).not.toContain('child');
    });

    it('returns an empty array if all tasks have parents', async () => {
      // Arrange: child1 (parent: p), child2 (parent: p), p (parent: g), g (parent: none)
      const g = taskDetail(user1.id, 'g');
      const p = { ...taskDetail(user1.id, 'p'), parents: ['g'] };
      const child1 = { ...taskDetail(user1.id, 'child1'), parents: ['p'] };
      const child2 = { ...taskDetail(user1.id, 'child2'), parents: ['p'] };
      const createDetails = [g, p, child1, child2];
      const createResult = await tasks.createTasks({ createDetails });
      expect(createResult).toBeOk();

      // Act
      const result = await tasks.getRootTasks();
      assert(result.isOk());
      const roots = result.value;

      // Assert
      // Only g is a root
      expect(roots.length).toBe(1);
      expect(roots[0].id).toBe('g');
    });
  });
});

describe('ITaskAdvancedFeatures', () => {
  describe('getTodaysTasks', () => {
    it('returns all tasks marked for today (todays_task: true)', async () => {
      // Arrange: two tasks for today, one not
      const t1 = { ...taskDetail(user1.id, 't1'), todays_task: true };
      const t2 = { ...taskDetail(user1.id, 't2'), todays_task: true };
      const t3 = { ...taskDetail(user1.id, 't3'), todays_task: false };
      const createResult = await tasks.createTasks({ createDetails: [t1, t2, t3] });
      assert(createResult.isOk());

      // Act
      const result = await tasks.getTodaysTasks();
      assert(result.isOk());
      const todays = result.value;

      // Assert
      expect(todays.length).toBe(2);
      const ids = todays.map(t => t.id);
      expect(ids).toContain('t1');
      expect(ids).toContain('t2');
      expect(ids).not.toContain('t3');
    });

    it('returns an empty array if no tasks are for today', async () => {
      // Arrange: all tasks not for today
      const t1 = { ...taskDetail(user1.id, 't1'), todays_task: false };
      const t2 = { ...taskDetail(user1.id, 't2'), todays_task: false };
      const createResult = await tasks.createTasks({ createDetails: [t1, t2] });
      assert(createResult.isOk());

      // Act
      const result = await tasks.getTodaysTasks();
      assert(result.isOk());
      const todays = result.value;

      // Assert
      expect(todays.length).toBe(0);
    });
  });

  describe('getPrioritizedTasks', () => {
    it.todo('returns the top N prioritized tasks (by priority field)');
    it.todo('respects the provided limit');
    it.todo('returns an empty array if there are no tasks');
  });
  describe('searchTasks', () => {
    it.todo('returns tasks matching the search term in title or content');
    it.todo('returns an empty array if no tasks match');
  });
});

describe.todo('ITaskExporter', () => {
  describe('exportData', () => {
    it.todo('respects the simplify flag if provided');
  });
  describe('importData', () => {
    it.todo('returns the number of tasks imported');
    it.todo('handles invalid data gracefully');
  });
  it('preserves data through a round-trip export-import process', async () => {
    // Arrange: create some tasks
    const t1 = taskDetail(user1.id, 't1');
    const t2 = taskDetail(user2.id, 't2');
    const createResult = await tasks.createTasks({ createDetails: [t1, t2] });
    assert(createResult.isOk());

    // Export data
    let exportedData: any = null;
    // Mock the exportData method to capture the data instead of triggering a download
    const originalExportData = tasks.exportData;
    tasks.exportData = async (params) => {
      // Simulate export by returning all tasks as JSON
      const allTasksResult = await tasks.getTasks({ ids: ['t1', 't2'] });
      assert(allTasksResult.isOk());
      exportedData = JSON.stringify(allTasksResult.value);
    };
    await tasks.exportData({});
    tasks.exportData = originalExportData;
    expect(exportedData).not.toBeNull();

    // Clear DB
    await db.clear(TASK_TABLE_NAME);

    // Import data
    // Mock importData to parse the JSON and re-create the tasks
    const originalImportData = tasks.importData;
    tasks.importData = async ({ data }) => {
      const imported = JSON.parse(data);
      await tasks.createTasks({ createDetails: imported });
      return imported.length;
    };
    const importCount = await tasks.importData({ data: exportedData });
    tasks.importData = originalImportData;
    expect(importCount).toBe(2);

    // Assert: tasks are restored
    const getResult = await tasks.getTasks({ ids: ['t1', 't2'] });
    assert(getResult.isOk());
    const [found] = extractBatch(getResult);
    expect(found.length).toBe(2);
    expect(found.map(t => t.id)).toContain('t1');
    expect(found.map(t => t.id)).toContain('t2');
  });
});