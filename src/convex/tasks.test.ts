// convex/tasks.test.ts
import { convexTest } from "convex-test";
import { describe, test, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { type Id } from "./_generated/dataModel";
import { CreateTaskParams, ExportedData, UpdateTaskParams } from "$domain/models/task";
import { AppData, IAppNode } from "$domain/models/node";

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

function buildTaskCreate(overrides: Partial<CreateTaskParams<number>> = {}): CreateTaskParams<number> {
	return {
		title: "Test Task",
		status: 0,
		...overrides,
	};
}

function buildTaskUpdate(id: string, data: Partial<UpdateTaskParams<number>> = {}): UpdateTaskParams<number> {
	return { id, ...data };
}

async function getTaskById(t: TestContext, id: string) {
	const result = await t.run(async (ctx) => {
		return await ctx.db.get(id as Id<"nodes">);
	});
	return result;
}

async function getAllTasksForUser(t: TestContext, userId: string, excludeRoot: boolean = false) {
	const all = await t.run(async (ctx) => {
		const all = await ctx.db.query("nodes").collect();
		return all.filter(node => node.userAuthId === userId);
	});
	return excludeRoot ? all.filter(node => node.data.type !== "project") : all;
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
		expect(result.created.data.title).toBe("Orphan Task");
		expect(result.created.parents).toHaveLength(1);

		// Verify root exists and has task as child
		const root = await getTaskById(t, result.created.parents[0] as Id<"nodes">);
		expect(root).toBeDefined();
		expect(root!.data.type).toBe("project");
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

		const root = await getTaskById(t, rootId as Id<"nodes">);
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
					parents: ["non_existent_id" as Id<"nodes">],
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

		expect(result.created.data.givenId).toBe(id);
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
		expect(result.created[0].data.title).toBe("Task 1");
		expect(result.created[1].data.title).toBe("Task 2");
		expect(result.created[2].data.title).toBe("Task 3");

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

		expect(updated.updated.data.title).toBe("Updated");
		expect(updated.updated.data.status).toBe(0);
		expect(updated.updated.data.content).toBe("New content");
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
			addParents: [parent.created.id],
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
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			removeParents: [parent.created.id],

		});

		const refreshedParent = await getTaskById(t, parent.created.id);
		const refreshedChild = await getTaskById(t, child.created.id);

		expect(refreshedParent!.children).not.toContain(child.created.id);
		expect(refreshedChild!.parents).not.toContain(parent.created.id);

		// Should auto-attach to root
		expect(refreshedChild!.parents).toHaveLength(1);
		const root = await getTaskById(
			t,
			refreshedChild!.parents[0] as Id<"nodes">
		);
		expect(root!.data.type).toBe("project");
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
		const rootBefore = await getTaskById(t, parent.created.parents[0] as Id<"nodes">);

		// Verify child is NOT in root's children initially (it has a parent)
		expect(rootBefore!.children).not.toContain(child.created.id);

		// Remove parent relationship (makes child orphaned)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			removeParents: [parent.created.id],
		});

		const refreshedChild = await getTaskById(t, child.created.id);
		const rootId = refreshedChild!.parents[0];
		const rootAfter = await getTaskById(t, rootId as Id<"nodes">);

		// Child should be attached to root
		expect(refreshedChild!.parents).toContain(rootId);

		// Root should have child in its children list
		expect(rootAfter!.children).toContain(child.created.id);
	});

	test("removes root when task gains parents", async () => {
		const t = createTestCtx();

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1" }),
		});

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
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
			addParents: [p1.created.id],
		});

		const updated = await getTaskById(t, task.created.id);

		// Root should be auto-removed
		expect(updated!.parents).not.toContain(rootId);
		expect(updated!.parents).toContain(p1.created.id);
		expect(updated!.parents).toHaveLength(1);
	});

	test("removes child's parent reference when parent removes child", async () => {
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

		// Verify initial relationship
		const parentBefore = await getTaskById(t, parent.created.id);
		const childBefore = await getTaskById(t, child.created.id);
		expect(parentBefore!.children).toContain(child.created.id);
		expect(childBefore!.parents).toContain(parent.created.id);

		// Parent removes child from its children list
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			removeChildren: [child.created.id],
		});

		const parentAfter = await getTaskById(t, parent.created.id);
		const childAfter = await getTaskById(t, child.created.id);

		// Parent should no longer have child
		expect(parentAfter!.children).not.toContain(child.created.id);

		// Child should no longer have parent
		expect(childAfter!.parents).not.toContain(parent.created.id);
	});

	test("attaches orphaned child to root when parent removes child", async () => {
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

		// Get root before removing child
		const rootBefore = await getTaskById(t, parent.created.parents[0] as Id<"nodes">);

		// Verify child is NOT in root's children initially (it has a parent)
		expect(rootBefore!.children).not.toContain(child.created.id);

		// Parent removes child (makes child orphaned)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			removeChildren: [child.created.id],
		});

		const refreshedChild = await getTaskById(t, child.created.id);
		const rootId = refreshedChild!.parents[0];
		const rootAfter = await getTaskById(t, rootId as Id<"nodes">);

		// Child should be attached to root
		expect(refreshedChild!.parents).toContain(rootId);
		expect(refreshedChild!.parents).toHaveLength(1);

		// Root should have child in its children list
		expect(rootAfter!.children).toContain(child.created.id);
		expect(rootAfter!.data.type).toBe("project");
	});

	test("removes parent from child but keeps other parents when parent removes child", async () => {
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

		// Verify initial relationship
		const childBefore = await getTaskById(t, child.created.id);
		expect(childBefore!.parents).toContain(p1.created.id);
		expect(childBefore!.parents).toContain(p2.created.id);
		expect(childBefore!.parents).toHaveLength(2);

		// P1 removes child from its children list
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: p1.created.id,
			removeChildren: [child.created.id],
		});

		const p1After = await getTaskById(t, p1.created.id);
		const p2After = await getTaskById(t, p2.created.id);
		const childAfter = await getTaskById(t, child.created.id);

		// P1 should no longer have child
		expect(p1After!.children).not.toContain(child.created.id);

		// P2 should still have child
		expect(p2After!.children).toContain(child.created.id);

		// Child should no longer have P1, but still have P2
		expect(childAfter!.parents).not.toContain(p1.created.id);
		expect(childAfter!.parents).toContain(p2.created.id);
		expect(childAfter!.parents).toHaveLength(1);
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
			parents: [p2.created.id],
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
			parents: [p1.created.id, p2.created.id],
			addParents: [p3.created.id],
			removeParents: [p2.created.id],
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
			children: [c1.created.id, c2.created.id],
			addChildren: [c3.created.id],
			removeChildren: [c2.created.id],
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
			parents: [p1.created.id, p2.created.id, p3.created.id],
			addParents: [p4.created.id, p5.created.id],
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
			addChildren: [c1.created.id],
		});

		let updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).toContain(c1.created.id);

		// Add c2
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			addChildren: [c2.created.id],
		});

		updated = await getTaskById(t, parent.created.id);
		expect(updated!.children).toContain(c2.created.id);
		expect(updated!.children).toHaveLength(2);

		// Remove c1
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			removeChildren: [c1.created.id],
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
				addParents: ["some_id"],
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
				{ id: t1.created.id, title: "T1 Updated", status: 1 },
				{ id: t2.created.id, title: "T2 Updated", status: 1 },
			],
		});

		expect(result.updated).toHaveLength(2);
		expect(result.updated[0].data.title).toBe("T1 Updated");
		expect(result.updated[1].data.title).toBe("T2 Updated");
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
					addParents: [parent.created.id],
				},
				{
					id: c2.created.id,
					addParents: [parent.created.id],
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

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: parent.created.id });

		// Child should no longer reference parent
		const refreshedChild = await getTaskById(t, child.created.id);
		expect(refreshedChild!.parents).not.toContain(parent.created.id);

		// Child should be auto-attached to root
		expect(refreshedChild!.parents).toHaveLength(1);
		const root = await getTaskById(
			t,
			refreshedChild!.parents[0] as Id<"nodes">
		);
		expect(root!.data.type).toBe("project");
		expect(root!.children).toContain(child.created.id);
	});

	test("throws InvalidStateError when deleting root", async () => {
		const t = createTestCtx();

		const task = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate(),
		});

		const rootId = task.created.parents[0] as Id<"nodes">;

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: rootId })
		).rejects.toThrow(/(project|cannot|delete)*/);
	});

	test.todo("throws NotFoundError for non-existent task", async () => {
		const t = createTestCtx();

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, {
				id: "j577cbb0br3g5gjggkjdsa7mk57vdpfx" as Id<"nodes">,
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
		const allTasks = await getAllTasksForUser(t, "user1", false);
		const roots = allTasks.filter((t) => t.data.type === "project");
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

		expect(result.every((t) => t.data.type === "task")).toBe(true);
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
			parents: [p1.created.id],
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
			addChildren: [child.created.id],
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
			removeParents: [parent.created.id],
		});

		const updatedParent = await getTaskById(t, parent.created.id);
		expect(updatedParent!.children).not.toContain(child.created.id);
	});
});

//#endregion

//#region Cycle prevention

describe.skip("Cycle prevention", () => {
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
			addParents: [b.created.id],
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
			addParents: [c.created.id],
		});

		const timeout = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Cycle detection timeout")), 5000)
		);

		await expect(Promise.race([cycleAttempt, timeout])).rejects.toThrow();
	}, 6000);
});

//#endregion

//#region importData

describe("importData", () => {
	describe.todo("V0.0.0", () => { // TODO This should be handled by the roundtrip test below, but we need to rasterize it for legacy support
		const getV000ExportData = () => { }
		test("imports tasks with relationships where all referenced tasks are included", async () => {
			const t = createTestCtx();

			// Create export data with parent-child relationships
			const parentId = "exported_parent_1";
			const childId = "exported_child_1";
			const grandchildId = "exported_grandchild_1";

			const data: IAppNode<AppData<number>, number>[] = [
				{
					id: parentId,
					userAuthId: "original_user",
					parents: [],
					children: [childId],
					created: new Date().getTime(),
					lastEdit: new Date().getTime(),
					data: {
						type: "task" as const,
						title: "Parent",
						status: 0,
					}
				},
				{
					id: childId,
					userAuthId: "original_user",
					parents: [parentId],
					children: [grandchildId],
					created: new Date().getTime(),
					lastEdit: new Date().getTime(),
					data: {
						type: "task" as const,
						title: "Child",
						status: 0,
					}
				},
				{
					id: grandchildId,
					userAuthId: "original_user",
					parents: [childId],
					children: [],
					created: new Date().getTime(),
					lastEdit: new Date().getTime(),
					data: {
						type: "task" as const,
						title: "Grandchild",
						status: 0,
					}
				},
			]
			const exportData: ExportedData = {
				version: "0.0.0",
				exportedAt: new Date().getTime(),
				data
			};

			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
				data: JSON.stringify(exportData),
				mode: "add",
			});

			// Should import all tasks
			const allTasks = await getAllTasksForUser(t, "user1", true);
			expect(allTasks).toHaveLength(3);

			// Find imported tasks by title (since IDs will be different)
			const parent = allTasks.find(t => t.data.title === "Parent");
			const child = allTasks.find(t => t.data.title === "Child");
			const grandchild = allTasks.find(t => t.data.title === "Grandchild");

			expect(parent).toBeDefined();
			expect(child).toBeDefined();
			expect(grandchild).toBeDefined();

			// Verify bidirectional relationships are established
			if (parent && child && grandchild) {
				assertBidirectionalRelationship(parent, child);
				assertBidirectionalRelationship(child, grandchild);
			}
		});

		test("removes references to tasks not included in import without errors", async () => {
			const t = createTestCtx();

			const parentId = "exported_parent_1";
			const childId = "exported_child_1";
			const missingParentId = "missing_parent_1";
			const missingChildId = "missing_child_1";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
					{
						id: parentId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Parent",
						status: 0,
						parents: [missingParentId], // References a task NOT in import
						children: [childId, missingChildId], // Mix of included and missing
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
					{
						id: childId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Child",
						status: 0,
						parents: [parentId],
						children: [],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
				],
			};

			// Should not throw errors
			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
				data: JSON.stringify(exportData),
				mode: "add",
			});

			const allTasks = await getAllTasksForUser(t, "user1", true);
			expect(allTasks).toHaveLength(2);

			const parent = allTasks.find(t => t.data.title === "Parent");
			const child = allTasks.find(t => t.data.title === "Child");

			expect(parent).toBeDefined();
			expect(child).toBeDefined();

			// Parent should have missingParentId removed from parents
			// Parent should have missingChildId removed from children
			// Parent should only have childId in children
			if (parent && child) {
				expect(parent.parents).not.toContain(missingParentId);
				expect(parent.children).not.toContain(missingChildId);
				expect(parent.children).toContain(String(child._id));
				// Parent should be attached to root (since missingParentId was removed)
				expect(parent.parents.length).toBeGreaterThan(0);

				// Verify bidirectional relationship with child
				assertBidirectionalRelationship(parent, child);
			}
		});

		test("handles complex relationship graph with mixed valid and invalid references", async () => {
			const t = createTestCtx();

			const task1Id = "task_1";
			const task2Id = "task_2";
			const task3Id = "task_3";
			const missingId1 = "missing_1";
			const missingId2 = "missing_2";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
					{
						id: task1Id,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Task 1",
						status: 0,
						parents: [missingId1, task2Id], // Mix of missing and valid
						children: [task3Id],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
					{
						id: task2Id,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Task 2",
						status: 0,
						parents: [],
						children: [task1Id, missingId2], // Mix of valid and missing
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
					{
						id: task3Id,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Task 3",
						status: 0,
						parents: [task1Id],
						children: [],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
				],
			};

			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
				data: JSON.stringify(exportData),
				mode: "add",
			});

			const allTasks = await getAllTasksForUser(t, "user1", true);
			expect(allTasks).toHaveLength(3);

			const task1 = allTasks.find(t => t.data.title === "Task 1");
			const task2 = allTasks.find(t => t.data.title === "Task 2");
			const task3 = allTasks.find(t => t.data.title === "Task 3");

			expect(task1).toBeDefined();
			expect(task2).toBeDefined();
			expect(task3).toBeDefined();

			if (task1 && task2 && task3) {
				// Task1 should have missingId1 removed, but still have task2Id
				expect(task1.parents).not.toContain(missingId1);
				expect(task1.parents).toContain(String(task2._id));
				expect(task1.children).toContain(String(task3._id));

				// Task2 should have missingId2 removed, but still have task1Id
				expect(task2.children).not.toContain(missingId2);
				expect(task2.children).toContain(String(task1._id));

				// Verify bidirectional relationships
				assertBidirectionalRelationship(task2, task1);
				assertBidirectionalRelationship(task1, task3);
			}
		});

		test("replace mode clears existing tasks and imports new ones with relationships", async () => {
			const t = createTestCtx();

			// Create some existing tasks
			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate({ title: "Existing 1" }),
			});
			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate({ title: "Existing 2" }),
			});

			// Verify they exist
			let allTasks = await getAllTasksForUser(t, "user1");
			expect(allTasks.length).toBeGreaterThanOrEqual(2);

			// Import new tasks
			const parentId = "imported_parent";
			const childId = "imported_child";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
					{
						id: parentId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Imported Parent",
						status: 0,
						parents: [],
						children: [childId],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
					{
						id: childId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Imported Child",
						status: 0,
						parents: [parentId],
						children: [],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
				],
			};

			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
				data: JSON.stringify(exportData),
				mode: "replace",
			});

			// Should only have imported tasks (plus root)
			allTasks = await getAllTasksForUser(t, "user1");
			const taskTasks = allTasks.filter(t => t.data.type === "task");
			expect(taskTasks).toHaveLength(2);

			// Existing tasks should be gone
			const existing1Found = taskTasks.find(t => t.data.title === "Existing 1");
			const existing2Found = taskTasks.find(t => t.data.title === "Existing 2");
			expect(existing1Found).toBeUndefined();
			expect(existing2Found).toBeUndefined();

			// Imported tasks should exist with relationships
			const importedParent = taskTasks.find(t => t.data.title === "Imported Parent");
			const importedChild = taskTasks.find(t => t.data.title === "Imported Child");
			expect(importedParent).toBeDefined();
			expect(importedChild).toBeDefined();

			if (importedParent && importedChild) {
				assertBidirectionalRelationship(importedParent, importedChild);
			}
		});

		test("handles tasks with no relationships gracefully", async () => {
			const t = createTestCtx();

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
					{
						id: "task_1",
						userAuthId: "original_user",
						type: "task" as const,
						title: "Orphan Task",
						status: 0,
						parents: [],
						children: [],
						created: new Date().toISOString(),
						lastEdit: new Date().toISOString(),
					},
				],
			};

			await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
				data: JSON.stringify(exportData),
				mode: "add",
			});

			const allTasks = await getAllTasksForUser(t, "user1");
			const orphan = allTasks.find(t => t.data.title === "Orphan Task");
			expect(orphan).toBeDefined();
			// Should be attached to root
			if (orphan) {
				expect(orphan.parents.length).toBe(1);
			}
		});
	});

	test("exports data and imports it back correctly (Round Trip)", async () => {
		const t = createTestCtx();

		// 1. Setup: Create a complex graph of tasks
		// Structure: P1 -> C1 -> GC1
		//            P2 (orphan)
		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "RT Parent" }),
		});

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "RT Child",
				parents: [p1.created.id],
			}),
		});

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "RT Grandchild",
				parents: [c1.created.id],
			}),
		});

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "RT Orphan" }),
		});

		// Verify setup
		const initialTasks = await getAllTasksForUser(t, "user1", true);
		expect(initialTasks).toHaveLength(4);

		// 2. Export
		const exportResult = await t.withIdentity(mockAuth("user1")).query(api.tasks.exportData, {});

		// Export includes the root project + 4 created tasks = 5 nodes
		expect(exportResult.data).toHaveLength(5);
		expect(exportResult.version).toBeDefined();

		// 3. Import (using replace mode to clear DB first)
		// We'll use a NEW identity to simulate importing into a fresh account or cleaning existing
		// But "replace" mode on the SAME user should work fine and is what we want to test (backup/restore)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.importData, {
			data: JSON.stringify(exportResult),
			mode: "replace",
		});

		// 4. Verify
		const restoredTasks = await getAllTasksForUser(t, "user1", true); // true = excludeRoot
		expect(restoredTasks).toHaveLength(4);

		const rParent = restoredTasks.find(t => t.data.title === "RT Parent");
		const rChild = restoredTasks.find(t => t.data.title === "RT Child");
		const rGrandchild = restoredTasks.find(t => t.data.title === "RT Grandchild");
		const rOrphan = restoredTasks.find(t => t.data.title === "RT Orphan");

		expect(rParent).toBeDefined();
		expect(rChild).toBeDefined();
		expect(rGrandchild).toBeDefined();
		expect(rOrphan).toBeDefined();

		// IDs will change, so we verify relationships via the new IDs
		assertBidirectionalRelationship(rParent!, rChild!);
		assertBidirectionalRelationship(rChild!, rGrandchild!);

		// Orphan should have no parents (except root, which is handled internally)
		// The helper checks explicit parents/children properties.
		// Note: cleanNodeForClient might expose parents array.
		// Let's check that orphan is not connected to others.
		expect(rOrphan!.children).toHaveLength(0);
		// Check it's not child of others
		expect(rParent!.children).not.toContain(rOrphan!.id);
	});
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
describe("getProjects", () => {
	test("returns all projects for the authenticated user", async () => {
		const t = createTestCtx();
		let projA: Id<"nodes">;
		let projB: Id<"nodes">;
		let otherUserProj: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			projA = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "project" as const,
					title: "Project A",
					status: 0,
					content: undefined,
					dueDate: undefined,
				},
			});
			projB = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "project" as const,
					title: "Project B",
					status: 0,
					content: undefined,
					dueDate: undefined,
				},
			});

			// Non-project should be excluded
			await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task not project",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});
		});

		await t.withIdentity(mockAuth("user2")).run(async (ctx) => {
			const now = Date.now();
			otherUserProj = await ctx.db.insert("nodes", {
				userAuthId: "user2",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "project" as const,
					title: "Other User Project",
					status: 0,
					content: undefined,
					dueDate: undefined,
				},
			});
		});

		const projects = await t.withIdentity(mockAuth("user1")).query(api.tasks.getProjects, {});
		const ids = projects.map((p) => p.id);

		expect(projects).toHaveLength(2);
		expect(ids).toContain(String(projA!));
		expect(ids).toContain(String(projB!));
		expect(ids).not.toContain(String(otherUserProj!));
		expect(projects.every((p) => p.data.type === "project")).toBe(true);
	});
});

describe("getProjectSubtree", () => {
	test("returns project node plus descendants for the user", async () => {
		const t = createTestCtx();
		let projectId: Id<"nodes">;
		let childA: Id<"nodes">;
		let childB: Id<"nodes">;
		let grandchild: Id<"nodes">;
		let otherUserNode: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			projectId = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "project" as const,
					title: "Project One",
					status: 0,
					content: undefined,
					dueDate: undefined,
				},
			});

			childA = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [String(projectId)],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Child A",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});

			grandchild = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [""],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Grandchild",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});

			childB = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [String(projectId)],
				children: [String(grandchild)],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Child B",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});

			// Fix grandchild parent to childB
			await ctx.db.patch(grandchild, { parents: [String(childB)] });

			// Attach children to project
			await ctx.db.patch(projectId, { children: [String(childA), String(childB)] });
		});

		await t.withIdentity(mockAuth("user2")).run(async (ctx) => {
			const now = Date.now();
			otherUserNode = await ctx.db.insert("nodes", {
				userAuthId: "user2",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "project" as const,
					title: "Other User",
					status: 0,
					content: undefined,
					dueDate: undefined,
				},
			});
		});

		const result = await t.withIdentity(mockAuth("user1")).query(api.tasks.getProjectSubtree, {
			id: String(projectId!),
		});

		const ids = new Set(result.map((n) => n.id));
		expect(ids.has(String(projectId!))).toBe(true);
		expect(ids.has(String(childA!))).toBe(true);
		expect(ids.has(String(childB!))).toBe(true);
		expect(ids.has(String(grandchild!))).toBe(true);
		expect(ids.has(String(otherUserNode!))).toBe(false);
		expect(result).toHaveLength(4);

		await expect(
			t.withIdentity(mockAuth("user2")).query(api.tasks.getProjectSubtree, { id: String(projectId!) })
		).rejects.toThrow();
	});
});

describe("getPrioritizedTasks", () => {
	test("handles cycles gracefully without infinite loops", async () => {
		const t = createTestCtx();

		// Create tasks that will form a cycle: A -> B -> A
		// We need to manually insert them to bypass cycle detection in mutations
		let taskAId: Id<"nodes">;
		let taskBId: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			// Create task A
			taskAId = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task A",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});

			// Create task B
			taskBId = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task B",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			});

			// Manually create cycle: A -> B -> A
			await ctx.db.patch(taskAId, {
				children: [String(taskBId)],
			});
			await ctx.db.patch(taskBId, {
				children: [String(taskAId)],
				parents: [String(taskAId)],
			});
			await ctx.db.patch(taskAId, {
				parents: [String(taskBId)],
			});

			// Attach A to root so it's reachable
			const roots = await ctx.db
				.query("nodes")
				.withIndex("by_user_type", (q) => q.eq("userAuthId", "user1").eq("data.type", "project"))
				.collect();
			let root = roots[0];
			if (!root) {
				// Create root if it doesn't exist
				const now = Date.now();
				const rootId = await ctx.db.insert("nodes", {
					userAuthId: "user1",
					parents: [],
					children: [],
					lastEdit: now,
					created: now,
					data: {
						type: "project" as const,
						title: "",
						status: 0,
						content: undefined,
						dueDate: undefined,
					},
				});
				const createdRoot = await ctx.db.get(rootId);
				if (!createdRoot) {
					throw new Error("Failed to create root project");
				}
				root = createdRoot;
			}
			if (root) {
				const rootChildren = [...(root.children ?? [])];
				if (!rootChildren.includes(String(taskAId))) {
					rootChildren.push(String(taskAId));
					await ctx.db.patch(root._id, {
						children: rootChildren,
					});
				}
			}
		});

		// Call getPrioritizedTasks with a timeout to detect infinite loops
		const queryPromise = t.withIdentity(mockAuth("user1")).query(api.tasks.getPrioritizedTasks, {
			limit: 10,
		});

		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Query timed out - possible infinite loop")), 2000)
		);

		// Should complete within timeout (not hang)
		const result = await Promise.race([queryPromise, timeoutPromise]);

		// Should return results (may include tasks from the cycle or other tasks)
		expect(Array.isArray(result)).toBe(true);
		// Should not hang indefinitely
	}, 3000);

	test("handles complex cycles (A -> B -> C -> A) gracefully", async () => {
		const t = createTestCtx();

		let taskAId: Id<"nodes">;
		let taskBId: Id<"nodes">;
		let taskCId: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			// Create three tasks
			taskAId = (await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task A",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			})) as Id<"nodes">;

			taskBId = (await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task B",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			})) as Id<"nodes">;

			taskCId = (await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [],
				children: [],
				lastEdit: now,
				created: now,
				data: {
					type: "task" as const,
					title: "Task C",
					status: 0,
					content: undefined,
					todaysTask: undefined,
					dueDate: undefined,
				},
			})) as Id<"nodes">;

			// Create cycle: A -> B -> C -> A
			await ctx.db.patch(taskAId, {
				children: [String(taskBId)],
				parents: [String(taskCId)],
			});
			await ctx.db.patch(taskBId, {
				children: [String(taskCId)],
				parents: [String(taskAId)],
			});
			await ctx.db.patch(taskCId, {
				children: [String(taskAId)],
				parents: [String(taskBId)],
			});

			// Attach A to root so it's reachable
			const roots = await ctx.db
				.query("nodes")
				.withIndex("by_user_type", (q) => q.eq("userAuthId", "user1").eq("data.type", "project"))
				.collect();
			let root = roots[0];
			if (!root) {
				// Create root if it doesn't exist
				const now = Date.now();
				const rootId = await ctx.db.insert("nodes", {
					userAuthId: "user1",
					parents: [],
					children: [],
					lastEdit: now,
					created: now,
					data: {
						type: "project" as const,
						title: "",
						status: 0,
						content: undefined,
						dueDate: undefined,
					},
				});
				const createdRoot = await ctx.db.get(rootId);
				if (!createdRoot) {
					throw new Error("Failed to create root project");
				}
				root = createdRoot;
			}
			if (root) {
				const rootChildren = [...(root.children ?? [])];
				if (!rootChildren.includes(String(taskAId))) {
					rootChildren.push(String(taskAId));
					await ctx.db.patch(root._id, {
						children: rootChildren,
					});
				}
			}
		});

		const queryPromise = t.withIdentity(mockAuth("user1")).query(api.tasks.getPrioritizedTasks, {
			limit: 10,
		});

		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Query timed out - possible infinite loop")), 2000)
		);

		const result = await Promise.race([queryPromise, timeoutPromise]);

		expect(Array.isArray(result)).toBe(true);
	}, 3000);
});
describe.todo("searchTasks");

//#endregion