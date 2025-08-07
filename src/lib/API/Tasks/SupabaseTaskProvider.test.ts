import { it, beforeEach, beforeAll, assert, describe, expect } from 'vitest';
import type { CreateTaskParams, ITasks } from './types';
import type { User } from '../Auth/types';
import SupabaseTaskProvider from './SupabaseTaskProvider';
import supabase, { TASK_TABLE_NAME } from '../SupabaseClient';
import { ErrorType, type NotImplementedError } from '$lib/Errors';
import type { err } from 'neverthrow';
import { extractBatch, type okBatch } from '../types';


//#region Setup

let tasks: ITasks;

const user1: User = {
  id: "User1",
  last_synced: new Date(0),
}
const user2: User = {
  id: "User2",
  last_synced: new Date(0),
}

function taskDetail(userId?: string, id?: string): CreateTaskParams {
  return {
    id,
    title: `TEST - ${userId} - Task`,
    user_id: userId ?? user1.id,
  }
}

beforeAll(async () => {
  tasks = await SupabaseTaskProvider.get();
});
beforeEach(async () => {
  await supabase.from(TASK_TABLE_NAME).delete().contains('id', 'TEST'); // basically WHERE true
});

//#endregion

// TODO:test verify relationship behavior of create, update, delete

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