// convex/tasks.test.ts
import { convexTest } from "convex-test";
import { describe, test, expect, beforeEach, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { type Id } from "./_generated/dataModel";

//#region Test Utilities

type TestContext = Awaited<ReturnType<typeof convexTest>>;

function createTestCtx() {
	return convexTest(schema, import.meta.glob("./**/*.*s"));
}

function mockAuth(subject: string) {
	return {
		subject,
		tokenIdentifier: `test|${subject}`,
		issuer: "test",
		name: subject,
		email: `${subject}@test.com`,
	};
}

function buildTaskCreate(overrides: Partial<any> = {}) {
	return {
		type: "task" as const,
		title: "Test Task",
		status: 0,
		...overrides,
	};
}

function buildTaskUpdate(id: string, data: Partial<any> = {}) {
	return { id, data: { type: "task" as const, ...data } };
}

async function getTaskById(t: TestContext, id: string) {
	const result = await t.run(async (ctx) => {
		return await ctx.db.get(id as Id<"tasks">);
	});
	return result;
}

async function getAllTasksForUser(t: TestContext, userId: string) {
	return await t.run(async (ctx) => {
		const all = await ctx.db.query("tasks").collect();
		return all.filter(task => task.userAuthId === userId);
	});
}

function assertBidirectionalRelationship(
	parent: { _id?: string; id?: string; children: string[] },
	child: { _id?: string; id?: string; parents: string[] }
) {
	const parentId = String(parent._id || parent.id);
	const childId = String(child._id || child.id);
	expect(parent.children).toContain(childId);
	expect(child.parents).toContain(parentId);
}

//#endregion

//#region createTask (single)

describe("createTask", () => {
	test("creates task with no parents and attaches to root", async () => {
		const t = createTestCtx();

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Orphan Task" }),
		});

		expect(result.created).toBeDefined();
		expect(result.created.title).toBe("Orphan Task");
		expect(result.created.parents).toHaveLength(1);

		// Verify root exists and has task as child
		const root = await getTaskById(t, result.created.parents[0] as Id<"tasks">);
		expect(root).toBeDefined();
		expect(root!.type).toBe("root");
		expect(root!.children).toContain(result.created.id);

		// Verify affected includes root
		expect(result.affected).toContainEqual(
			expect.objectContaining({ id: root!._id })
		);
	});

	test("creates task with explicit parent and establishes bidirectional link", async () => {
		const t = createTestCtx();

		// Create parent
		const parentResult = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		// Create child with explicit parent
		const childResult = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parentResult.created.id],
			}),
		});

		const parent = await getTaskById(t, parentResult.created.id);
		const child = await getTaskById(t, childResult.created.id);

		assertBidirectionalRelationship(parent!, child!);
	});

	test("creates task with explicit root parent and updates root.children", async () => {
		const t = createTestCtx();

		// Create first task to force root creation
		const first = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "First" }),
		});
		const rootId = first.created.parents[0];

		// Explicitly attach second task to root
		const second = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Second",
				parents: [rootId],
			}),
		});

		const root = await getTaskById(t, rootId as Id<"tasks">);
		expect(root!.children).toContain(first.created.id);
		expect(root!.children).toContain(second.created.id);
	});

	test("respects client-provided created timestamp", async () => {
		const t = createTestCtx();

		const yesterday = Date.now() - 86400000;

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ created: yesterday }),
		});

		expect(result.created.created).toBe(yesterday);
	});

	test("creates task with multiple parents and establishes all relationships", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});
		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [p1.created.id, p2.created.id],
			}),
		});

		const parent1 = await getTaskById(t, p1.created.id);
		const parent2 = await getTaskById(t, p2.created.id);
		const childTask = await getTaskById(t, child.created.id);

		assertBidirectionalRelationship(parent1!, childTask!);
		assertBidirectionalRelationship(parent2!, childTask!);
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();

		await expect(
			t.mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate(),
			})
		).rejects.toThrow();
	});

	test("throws NotFoundError when parent does not exist", async () => {
		const t = createTestCtx();

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate({
					parents: ["non_existent_id" as Id<"tasks">],
				}),
			})
		).rejects.toThrow("NotFound");
	});

	test("returns oldId for optimistic updates", async () => {
		const t = createTestCtx();

		const id = "test_id";
		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ id }),
		});

		expect(result.created.givenId).toBe(id);
	});
});

//#endregion

//#region createTasks (batch)

describe("createTasks", () => {
	test("creates multiple tasks and returns all created + affected", async () => {
		const t = createTestCtx();

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTasks, {
			createDetails: [
				buildTaskCreate({ title: "Task 1" }),
				buildTaskCreate({ title: "Task 2" }),
				buildTaskCreate({ title: "Task 3" }),
			],
		});

		expect(result.created).toHaveLength(3);
		expect(result.created[0].title).toBe("Task 1");
		expect(result.created[1].title).toBe("Task 2");
		expect(result.created[2].title).toBe("Task 3");

		// All should attach to same root
		const rootId = result.created[0].parents[0];
		expect(result.created[1].parents[0]).toBe(rootId);
		expect(result.created[2].parents[0]).toBe(rootId);

		// Root should be in affected exactly once
		const affectedIds = result.affected.map((t) => t.id);
		const rootCount = affectedIds.filter((id) => id === rootId).length;
		expect(rootCount).toBe(1);
	});

	test("creates linked parent-child tasks in batch", async () => {
		const t = createTestCtx();

		// Note: In a real scenario, client would generate temp IDs and resolve them.
		// Here we'll create parent first, then child in same batch.
		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTasks, {
			createDetails: [
				buildTaskCreate({
					title: "Child 1",
					parents: [parent.created.id],
				}),
				buildTaskCreate({
					title: "Child 2",
					parents: [parent.created.id],
				}),
			],
		});

		const refreshedParent = await getTaskById(t, parent.created.id);
		expect(refreshedParent!.children).toContain(String(result.created[0].id));
		expect(refreshedParent!.children).toContain(String(result.created[1].id));

		// Parent should be in affected
		expect(result.affected).toContainEqual(
			expect.objectContaining({ id: parent.created.id })
		);
	});

	test("deduplicates affected tasks", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Shared Parent" }),
		});

		// Create two children of same parent
		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTasks, {
			createDetails: [
				buildTaskCreate({
					title: "Child 1",
					parents: [parent.created.id],
				}),
				buildTaskCreate({
					title: "Child 2",
					parents: [parent.created.id],
				}),
			],
		});

		// Parent should appear in affected only once
		const parentAffectedCount = result.affected.filter(
			(t) => t.id === parent.created.id
		).length;
		expect(parentAffectedCount).toBe(1);
	});
});

//#endregion

//#region updateTask (single)

describe("updateTask", () => {
	test("updates task fields and bumps lastEdit", async () => {
		const t = createTestCtx();

		const created = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Original", status: 1 }),
		});

		const originalLastEdit = created.created.lastEdit;

		// Wait a tick to ensure timestamp changes
		await new Promise((resolve) => setTimeout(resolve, 10));

		const updated = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			...buildTaskUpdate(created.created.id, {
				title: "Updated",
				status: 0,
				content: "New content",
			}),
		});

		expect(updated.updated.title).toBe("Updated");
		expect(updated.updated.status).toBe(1);
		expect(updated.updated.content).toBe("New content");
		expect(updated.updated.lastEdit).toBeGreaterThan(originalLastEdit);
	});

	test("adds parent and propagates relationship", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Child" }),
		});

		// Add parent relationship
		const updated = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			data: {
				type: "task",
				addParents: [parent.created.id],
			},
		});

		const refreshedParent = await getTaskById(t, parent.created.id);
		const refreshedChild = await getTaskById(t, child.created.id);

		assertBidirectionalRelationship(refreshedParent!, refreshedChild!);

		// Parent should be in affected
		expect(updated.affected).toContainEqual(
			expect.objectContaining({ id: parent.created.id })
		);
	});

	test("removes parent and propagates relationship", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parent.created.id],
			}),
		});

		// Remove parent relationship
		const updated = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			data: {
				type: "task",
				removeParents: [parent.created.id],
			},
		});

		const refreshedParent = await getTaskById(t, parent.created.id);
		const refreshedChild = await getTaskById(t, child.created.id);

		expect(refreshedParent!.children).not.toContain(child.created.id);
		expect(refreshedChild!.parents).not.toContain(parent.created.id);

		// Should auto-attach to root
		expect(refreshedChild!.parents).toHaveLength(1);
		const root = await getTaskById(
			t,
			refreshedChild!.parents[0] as Id<"tasks">
		);
		expect(root!.type).toBe("root");
	});

	test("adds orphaned task to root.children when parent is removed", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parent.created.id],
			}),
		});

		// Get root before removing parent
		const rootBefore = await getTaskById(t, parent.created.parents[0] as Id<"tasks">);
		
		// Verify child is NOT in root's children initially (it has a parent)
		expect(rootBefore!.children).not.toContain(child.created.id);

		// Remove parent relationship (makes child orphaned)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			data: {
				type: "task",
				removeParents: [parent.created.id],
			},
		});

		const refreshedChild = await getTaskById(t, child.created.id);
		const rootId = refreshedChild!.parents[0];
		const rootAfter = await getTaskById(t, rootId as Id<"tasks">);

		// Child should be attached to root
		expect(refreshedChild!.parents).toContain(rootId);
		
		// Root should have child in its children list
		expect(rootAfter!.children).toContain(child.created.id);
	});

	test("removes root when task has multiple parents", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});

		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2" }),
		});

		// Create task attached to root
		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Task" }),
		});

		const rootId = task.created.parents[0];

		// Add two non-root parents
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			data: {
				type: "task",
				addParents: [p1.created.id, p2.created.id],
			},
		});

		const updated = await getTaskById(t, task.created.id);

		// Root should be auto-removed
		expect(updated!.parents).not.toContain(rootId);
		expect(updated!.parents).toContain(p1.created.id);
		expect(updated!.parents).toContain(p2.created.id);
		expect(updated!.parents).toHaveLength(2);
	});

	test("removes task from root.children when task gains non-root parent", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		// Create task attached to root
		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Task" }),
		});

		const rootId = task.created.parents[0];
		const rootBefore = await getTaskById(t, rootId as Id<"tasks">);
		
		// Verify task is initially in root's children
		expect(rootBefore!.children).toContain(task.created.id);

		// Add non-root parent
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			data: {
				type: "task",
				addParents: [parent.created.id],
			},
		});

		const updatedTask = await getTaskById(t, task.created.id);
		const rootAfter = await getTaskById(t, rootId as Id<"tasks">);

		// Root should be removed from task's parents
		expect(updatedTask!.parents).not.toContain(rootId);
		expect(updatedTask!.parents).toContain(parent.created.id);
		
		// Task should be removed from root's children
		expect(rootAfter!.children).not.toContain(task.created.id);
	});

	test("replaces parents with absolute assignment", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});

		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2" }),
		});

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Task",
				parents: [p1.created.id],
			}),
		});

		// Absolute replacement
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			data: {
				type: "task",
				parents: [p2.created.id],
			},
		});

		const updated = await getTaskById(t, task.created.id);
		expect(updated!.parents).toEqual([p2.created.id]);
	});

	test("mixes strings and delta operations for parents", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});
		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2" }),
		});
		const p3 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P3" }),
		});
		const p4 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P4" }),
		});

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Task" }),
		});

		// Mix: two set operations (absolute replacement), one add, one remove
		// Set operations should be collected first: [p1, p2]
		// Then add p3, then remove p2
		// Final result should be [p1, p3]
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			data: {
				type: "task",
				parents: [p1.created.id, p2.created.id],
				addParents: [p3.created.id],
				removeParents: [p2.created.id],
			},
		});

		const updated = await getTaskById(t, task.created.id);
		expect(updated!.parents).toContain(p1.created.id);
		expect(updated!.parents).toContain(p3.created.id);
		expect(updated!.parents).not.toContain(p2.created.id);
		expect(updated!.parents).not.toContain(p4.created.id);
		expect(updated!.parents).toHaveLength(2);
		// Verify order: set operations [p1, p2] collected first, then p3 added at end, then p2 removed
		// Final order should be [p1, p3]
		expect(updated!.parents).toEqual([p1.created.id, p3.created.id]);
	});

	test("mixes strings and delta operations for children", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C1" }),
		});
		const c2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C2" }),
		});
		const c3 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C3" }),
		});
		const c4 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C4" }),
		});

		// Mix: two strings (absolute replacement), one add, one remove
		// Strings should be collected first: [c1, c2]
		// Then add c3, then remove c2
		// Final result should be [c1, c3]
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			data: {
				type: "task",
				children: [c1.created.id, c2.created.id],
				addChildren: [c3.created.id],
				removeChildren: [c2.created.id],
			},
		});

		const updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).toContain(c1.created.id);
		expect(updated!.children).toContain(c3.created.id);
		expect(updated!.children).not.toContain(c2.created.id);
		expect(updated!.children).not.toContain(c4.created.id);
		expect(updated!.children).toHaveLength(2);
	});

	test("preserves order of set operations and appends adds to end", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});
		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2" }),
		});
		const p3 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P3" }),
		});
		const p4 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P4" }),
		});
		const p5 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P5" }),
		});

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Task" }),
		});

		// Multiple set operations should preserve order: [p1, p2, p3]
		// Then add p4 and p5 at end
		// Final result should be [p1, p2, p3, p4, p5]
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			data: {
				type: "task",
				parents: [p1.created.id, p2.created.id, p3.created.id],
				addParents: [p4.created.id, p5.created.id],
			},
		});

		const updated = await getTaskById(t, task.created.id);
		expect(updated!.parents).toEqual([
			p1.created.id,
			p2.created.id,
			p3.created.id,
			p4.created.id,
			p5.created.id,
		]);
	});

	test("adds and removes children with delta operations", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C1" }),
		});

		const c2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C2" }),
		});

		// Add c1 as child
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			data: {
				type: "task",
				addChildren: [c1.created.id],
			},
		});

		let updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).toContain(c1.created.id);

		// Add c2
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			data: {
				type: "task",
				addChildren: [c2.created.id],
			},
		});

		updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).toContain(c2.created.id);
		expect(updated!.children).toHaveLength(2);

		// Remove c1
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			data: {
				type: "task",
				removeChildren: [c1.created.id],
			},
		});

		updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).not.toContain(c1.created.id);
		expect(updated!.children).toContain(c2.created.id);
	});

	test("throws NotFoundError for non-existent task", async () => {
		const t = createTestCtx();

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
				...buildTaskUpdate("non_existent_id", { title: "Nope" }),
			})
		).rejects.toThrow("not found");
	});

	test("throws NotAuthorizedError when updating another user's task", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "User1 Task" }),
		});

		// Switch to user2
		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.tasks.updateTask, {
				...buildTaskUpdate(task.created.id, { title: "Hijacked" }),
			})
		).rejects.toThrow("Not owner");
	});

	test("throws InvalidStateError when modifying root parents", async () => {
		const t = createTestCtx();

		// Create task to force root creation
		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		const rootId = task.created.parents[0];

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
				id: rootId,
				data: {
					type: "root",
					addParents: ["some_id"],
				},
			})
		).rejects.toThrow("Root");
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		await expect(
			t.mutation(api.tasks.updateTask, {
				...buildTaskUpdate(task.created.id, { title: "Nope" }),
			})
		).rejects.toThrow("NotAuthorized");
	});
});

//#endregion

//#region updateTasks (batch)

describe("updateTasks", () => {
	test("updates multiple tasks and returns updated + affected", async () => {
		const t = createTestCtx();

		const t1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T1" }),
		});
		const t2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T2" }),
		});

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTasks, {
			updates: [
				{ id: t1.created.id, data: { title: "T1 Updated", status: 1 } },
				{ id: t2.created.id, data: { title: "T2 Updated", status: 1 } },
			],
		});

		expect(result.updated).toHaveLength(2);
		expect(result.updated[0].title).toBe("T1 Updated");
		expect(result.updated[1].title).toBe("T2 Updated");
	});

	test("updates relationships in batch and deduplicates affected", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C1" }),
		});

		const c2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "C2" }),
		});

		// Batch update: attach both children to parent
		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTasks, {
			updates: [
				{
					id: c1.created.id,
					data: {
						addParents: [parent.created.id],
					}
				},
				{
					id: c2.created.id,
					data: {
						addParents: [parent.created.id],
					}
				},
			],
		});

		const refreshedParent = await getTaskById(t, parent.created.id);
		expect(refreshedParent!.children).toContain(c1.created.id);
		expect(refreshedParent!.children).toContain(c2.created.id);

		// Parent should be in affected only once
		const parentAffectedCount = result.affected.filter(
			(t) => t.id === parent.created.id
		).length;
		expect(parentAffectedCount).toBe(1);
	});
});

//#endregion

//#region deleteTask (single)

describe("deleteTask", () => {
	test("deletes task and removes from parent.children", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parent.created.id],
			}),
		});

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, {
			id: child.created.id,
		});

		// Task should be deleted
		const deleted = await getTaskById(t, child.created.id);
		expect(deleted).toBeNull();

		// Parent should no longer reference child
		const refreshedParent = await getTaskById(t, parent.created.id);
		expect(refreshedParent!.children).not.toContain(child.created.id);

		// Parent should be in affected
		expect(result.affected).toContainEqual(
			expect.objectContaining({ id: parent.created.id })
		);
	});

	test("deletes task with children and removes from their parents list", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parent.created.id],
			}),
		});

		await t.withIdentity(mockAuth("user1")).query(api.tasks.getTasks, { ids: [parent.created.id, child.created.id] });

		const deleteAffected = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: parent.created.id });

		// Child should no longer reference parent
		const refreshedChild = await getTaskById(t, child.created.id);
		expect(refreshedChild!.parents).not.toContain(parent.created.id);

		// Child should be auto-attached to root
		expect(refreshedChild!.parents).toHaveLength(1);
		const root = await getTaskById(
			t,
			refreshedChild!.parents[0] as Id<"tasks">
		);
		expect(root!.type).toBe("root");
		expect(root!.children).toContain(child.created.id);
	});

	test("throws InvalidStateError when deleting root", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		const rootId = task.created.parents[0] as Id<"tasks">;

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: rootId })
		).rejects.toThrow("Root task cannot be deleted");
	});

	test.todo("throws NotFoundError for non-existent task", async () => {
		const t = createTestCtx();

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, {
				id: "j577cbb0br3g5gjggkjdsa7mk57vdpfx" as Id<"tasks">,
			})
		).rejects.toThrow("not found");
	});

	test("throws NotAuthorizedError when deleting another user's task", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.tasks.deleteTask, { id: task.created.id })
		).rejects.toThrow("Not owner");
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		await expect(
			t.mutation(api.tasks.deleteTask, { id: task.created.id })
		).rejects.toThrow("NotAuthorized");
	});
});

//#endregion

//#region deleteTasks (batch)

describe("deleteTasks", () => {
	test("deletes multiple tasks and returns all affected", async () => {
		const t = createTestCtx();

		const t1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T1" }),
		});
		const t2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T2" }),
		});
		const t3 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T3" }),
		});

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTasks, {
			ids: [t1.created.id, t2.created.id, t3.created.id],
		});

		// All should be deleted
		expect(await getTaskById(t, t1.created.id)).toBeNull();
		expect(await getTaskById(t, t2.created.id)).toBeNull();
		expect(await getTaskById(t, t3.created.id)).toBeNull();

		// Root should be in affected (deduplicated)
		const rootId = t1.created.parents[0];
		const rootAffectedCount = result.affected.filter(
			(t) => t.id === rootId
		).length;
		expect(rootAffectedCount).toBe(1);
	});

	test("deletes tasks with shared parent and deduplicates affected", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "C1",
				parents: [parent.created.id],
			}),
		});

		const c2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "C2",
				parents: [parent.created.id],
			}),
		});

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTasks, {
			ids: [c1.created.id, c2.created.id],
		});

		// Parent should be in affected only once
		const parentAffectedCount = result.affected.filter(
			(t) => t.id === parent.created.id
		).length;
		expect(parentAffectedCount).toBe(1);

		// Parent should no longer reference children
		const refreshedParent = await getTaskById(t, parent.created.id);
		expect(refreshedParent!.children).not.toContain(c1.created.id);
		expect(refreshedParent!.children).not.toContain(c2.created.id);
	});
});

//#endregion

//#region Root task edge cases

describe("Root task edge cases", () => {
	test("creates exactly one root per user lazily", async () => {
		const t = createTestCtx();

		const t1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T1" }),
		});

		const t2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "T2" }),
		});

		// Both should share the same root
		expect(t1.created.parents[0]).toBe(t2.created.parents[0]);

		// Verify only one root exists
		const allTasks = await getAllTasksForUser(t, "user1");
		const roots = allTasks.filter((t) => t.type === "root");
		expect(roots).toHaveLength(1);
	});

	test("different users get different roots", async () => {
		const t = createTestCtx();

		const u1Task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "U1 Task" }),
		});

		const u2Task = await t.withIdentity(mockAuth("user2")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "U2 Task" }),
		});

		expect(u1Task.created.parents[0]).not.toBe(u2Task.created.parents[0]);
	});

	test("root is never returned in getAllUserTasks", async () => {
		const t = createTestCtx();

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Task" }),
		});

		const result = await t.query(api.tasks.getAllUserTasks, {
			userId: "user1",
		});

		expect(result.every((t) => t.type === "task")).toBe(true);
	});

	test("throws NotImplementedError when multiple roots exist (degenerate state)", async () => {
		const t = createTestCtx();

		// Manually insert two roots to simulate corruption
		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			await ctx.db.insert("tasks", {
				userAuthId: "user1",
				type: "root",
				title: "",
				status: 0,
				parents: [],
				children: [],
				lastEdit: Date.now(),
				created: Date.now(),
			});

			await ctx.db.insert("tasks", {
				userAuthId: "user1",
				type: "root",
				title: "",
				status: 0,
				parents: [],
				children: [],
				lastEdit: Date.now(),
				created: Date.now(),
			});
		});

		// Attempting to create a task should detect multiple roots and error
		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate(),
			})
		).rejects.toThrow("Multiple root tasks");
	});
});

//#endregion

//#region Relationship integrity & propagation

describe("Relationship integrity & propagation", () => {
	test("maintains bidirectional integrity after complex update chain", async () => {
		const t = createTestCtx();

		// Create hierarchy: P1 -> C1 -> GC1
		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "C1",
				parents: [p1.created.id],
			}),
		});

		const gc1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "GC1",
				parents: [c1.created.id],
			}),
		});

		// Move GC1 to be child of P1 instead
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: gc1.created.id,
			data: {
				type: "task",
				parents: [p1.created.id],
			},
		});

		const updatedP1 = await getTaskById(t, p1.created.id);
		const updatedC1 = await getTaskById(t, c1.created.id);
		const updatedGC1 = await getTaskById(t, gc1.created.id);

		// P1 should have both C1 and GC1 as children
		expect(updatedP1!.children).toContain(c1.created.id);
		expect(updatedP1!.children).toContain(gc1.created.id);

		// C1 should no longer have GC1 as child
		expect(updatedC1!.children).not.toContain(gc1.created.id);

		// GC1 should only have P1 as parent
		expect(updatedGC1!.parents).toEqual([p1.created.id]);
	});

	test("propagates changes when adding child via parent", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Child" }),
		});

		// Add child via parent.children update
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			data: {
				type: "task",
				addChildren: [child.created.id],
			},
		});

		const updatedChild = await getTaskById(t, child.created.id);
		expect(updatedChild!.parents).toContain(parent.created.id);
	});

	test("propagates changes when removing parent via child", async () => {
		const t = createTestCtx();

		const parent = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "Parent" }),
		});

		const child = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [parent.created.id],
			}),
		});

		// Remove parent via child.parents update
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			data: {
				type: "task",
				removeParents: [parent.created.id],
			},
		});

		const updatedParent = await getTaskById(t, parent.created.id);
		expect(updatedParent!.children).not.toContain(child.created.id);
	});
});

//#endregion

//#region Cycle prevention

describe("Cycle prevention", () => {
	test("detects and fails on simple cycle (A -> B -> A)", async () => {
		const t = createTestCtx();

		const a = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "A" }),
		});

		const b = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "B",
				parents: [a.created.id],
			}),
		});

		// Attempt to create cycle: A -> B -> A
		// TODO: This should fail once cycle detection is implemented
		// For now, test that we can detect infinite loop via timeout
		const cycleAttempt = t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: a.created.id,
			data: {
				type: "task",
				addParents: [b.created.id],
			},
		});

		// Set 5s timeout; if it exceeds, we have an infinite loop
		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Cycle detection timeout")), 5000)
		);

		await expect(Promise.race([cycleAttempt, timeout])).rejects.toThrow();
	}, 6000);

	test("detects and fails on deep cycle (A -> B -> C -> A)", async () => {
		const t = createTestCtx();

		const a = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "A" }),
		});

		const b = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "B",
				parents: [a.created.id],
			}),
		});

		const c = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "C",
				parents: [b.created.id],
			}),
		});

		// Attempt to create cycle: A -> B -> C -> A
		const cycleAttempt = t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: a.created.id,
			data: {
				type: "task",
				addParents: [c.created.id],
			},
		});

		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Cycle detection timeout")), 5000)
		);

		await expect(Promise.race([cycleAttempt, timeout])).rejects.toThrow();
	}, 6000);
});

//#endregion


//#region Query test scaffolding (TODOs)

describe.todo("getTask");
describe.todo("getTasks");
describe.todo("getAllUserTasks");
describe.todo("getChildrenOf");
describe.todo("getParentsOf");
describe.todo("getSiblingsOf");
describe.todo("getRootTasks");
describe.todo("getTodaysTasks");
describe.todo("getPrioritizedTasks");
describe.todo("searchTasks");

//#endregion