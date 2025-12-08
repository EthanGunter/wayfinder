// convex/tasks.test.ts
import { convexTest } from "convex-test";
import { describe, test, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { type Id } from "./_generated/dataModel";
import { CreateTaskParams, ExportedData, UpdateTaskParams } from "$domain/models/task";
import { AppData, IAppNode } from "$domain/models/node";
import { ProjectData, ProjectStatus } from "$domain/models/project";

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

async function createProject(
	t: TestContext,
	userId: string,
	overrides: Partial<ProjectData<number>> = {}
) {
	const now = Date.now();
	return await t.run(async (ctx) => {
		const id = await ctx.db.insert("nodes", {
			userAuthId: userId,
			parents: [],
			children: [],
			created: now,
			lastEdit: now,
			data: {
				type: "project" as const,
				title: overrides.title ?? "Project",
				status: overrides.status ?? ProjectStatus.active,
				content: overrides.content,
				dueDate: overrides.dueDate,
			},
		});
		return await ctx.db.get(id);
	});
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

async function createTaskWithProject(
	t: TestContext,
	userId: string,
	overrides: Partial<CreateTaskParams<number>> = {}
) {
	const projectId = overrides.parents?.[0] ?? (await createProject(t, userId))!._id;
	return await t.withIdentity(mockAuth(userId)).mutation(api.tasks.createTask, {
		createDetail: buildTaskCreate({
			...overrides,
			parents: overrides.parents ?? [projectId],
		}),
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
	test("throws when creating task with no parents", async () => {
		const t = createTestCtx();

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate({ title: "Orphan Task" }),
			})
		).rejects.toThrow();
	});

	test("creates task with explicit parent and establishes bidirectional link", async () => {
		const t = createTestCtx();

		// Create project parent
		const project = await createProject(t, "user1");

		// Create child with explicit parent
		const childResult = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "Child",
				parents: [project!._id],
			}),
		});

		const parent = await getTaskById(t, project!._id);
		const child = await getTaskById(t, childResult.created.id);

		assertBidirectionalRelationship(parent!, child!);
	});
	
	test("respects client-provided created timestamp", async () => {
		const t = createTestCtx();

		const yesterday = Date.now() - 86400000;
		const project = await createProject(t, "user1");

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ created: yesterday, parents: [project!._id] }),
		});

		expect(result.created.created).toBe(yesterday);
	});

	test("creates task with multiple parents and establishes all relationships", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P1", parents: [project!._id] }),
		});
		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "P2", parents: [project!._id] }),
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

	test("rejects parents that belong to different projects", async () => {
		const t = createTestCtx();

		const projectA = await createProject(t, "user1", { title: "Project A" });
		const projectB = await createProject(t, "user1", { title: "Project B" });

		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [projectA!._id] });
		const p2 = await createTaskWithProject(t, "user1", { title: "P2", parents: [projectB!._id] });

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
				createDetail: buildTaskCreate({
					title: "Cross Project Child",
					parents: [p1.created.id, p2.created.id],
				}),
			})
		).rejects.toThrow();
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
		const result = await createTaskWithProject(t, "user1", { id });

		expect(result.created.data.givenId).toBe(id);
	});
});

//#endregion

//#region createTasks (batch)

describe("createTasks", () => {
	test("creates multiple tasks and returns all created + affected", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTasks, {
			createDetails: [
				buildTaskCreate({ title: "Task 1", parents: [project!._id] }),
				buildTaskCreate({ title: "Task 2", parents: [project!._id] }),
				buildTaskCreate({ title: "Task 3", parents: [project!._id] }),
			],
		});

		expect(result.created).toHaveLength(3);
		expect(result.created[0].data.title).toBe("Task 1");
		expect(result.created[1].data.title).toBe("Task 2");
		expect(result.created[2].data.title).toBe("Task 3");

		// All should attach to provided project
		const projectId = project!._id;
		expect(result.created[0].parents).toEqual([projectId]);
		expect(result.created[1].parents).toEqual([projectId]);
		expect(result.created[2].parents).toEqual([projectId]);

		// Project should be in affected exactly once
		const affectedIds = result.affected.map((t) => t.id);
		const projectCount = affectedIds.filter((id) => id === projectId).length;
		expect(projectCount).toBe(1);
	});

	test("creates linked parent-child tasks in batch", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		// Parents anchored to the same project
		const parentA = await createTaskWithProject(t, "user1", { title: "Parent A", parents: [project!._id] });
		const parentB = await createTaskWithProject(t, "user1", { title: "Parent B", parents: [project!._id] });

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTasks, {
			createDetails: [
				buildTaskCreate({
					title: "Child 1",
					parents: [parentA.created.id, parentB.created.id],
				}),
				buildTaskCreate({
					title: "Child 2",
					parents: [parentA.created.id, parentB.created.id],
				}),
			],
		});

		const refreshedParentA = await getTaskById(t, parentA.created.id);
		const refreshedParentB = await getTaskById(t, parentB.created.id);
		expect(refreshedParentA!.children).toContain(String(result.created[0].id));
		expect(refreshedParentA!.children).toContain(String(result.created[1].id));
		expect(refreshedParentB!.children).toContain(String(result.created[0].id));
		expect(refreshedParentB!.children).toContain(String(result.created[1].id));

		// Parent should be in affected
		expect(result.affected).toContainEqual(
			expect.objectContaining({ id: parentA.created.id })
		);
		expect(result.affected).toContainEqual(
			expect.objectContaining({ id: parentB.created.id })
		);
	});

	test("deduplicates affected tasks", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Shared Parent", parents: [project!._id] });

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

		const created = await createTaskWithProject(t, "user1", { title: "Original", status: 1 });

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

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", { title: "Child", parents: [project!._id] });

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

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id, project!._id],
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

		// Should remain attached to project
		expect(refreshedChild!.parents).toEqual([project!._id]);
	});

	test("rejects removing the last parent without replacement", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id],
		});

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
				id: child.created.id,
				removeParents: [parent.created.id],
			})
		).rejects.toThrow();

		const refreshedChild = await getTaskById(t, child.created.id);
		expect(refreshedChild!.parents).toEqual([parent.created.id]);
	});

	test("rejects update that sets parents to empty array", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const child = await createTaskWithProject(t, "user1", { title: "Child", parents: [project!._id] });

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
				id: child.created.id,
				parents: [],
			})
		).rejects.toThrow();
	});

	test("keeps project parent when adding non-project parent", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });

		// Create task attached only to project
		const task = await createTaskWithProject(t, "user1", { title: "Task", parents: [project!._id] });

		// Add non-project parent -> project should be dropped
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			addParents: [p1.created.id],
		});

		const updated = await getTaskById(t, task.created.id);

		expect(updated!.parents).toEqual([project!._id, p1.created.id]);
	});

	test("removes child's parent reference when parent removes child", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });
		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id],
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

	test("reattaches orphaned child to project when parent removes child", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });
		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id],
		});

		// Parent removes child (makes child orphaned)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			removeChildren: [child.created.id],
		});

		const refreshedChild = await getTaskById(t, child.created.id);
		const refreshedProject = await getTaskById(t, project!._id);

		// Child should be attached to project
		expect(refreshedChild!.parents).toEqual([project!._id]);
		expect(refreshedProject!.children).toContain(child.created.id);
		expect(refreshedProject!.data.type).toBe("project");
	});

	test("removes parent from child but keeps other parents when parent removes child", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });
		const p2 = await createTaskWithProject(t, "user1", { title: "P2", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [p1.created.id, p2.created.id],
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

		const project = await createProject(t, "user1");
		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });
		const p2 = await createTaskWithProject(t, "user1", { title: "P2", parents: [project!._id] });

		const task = await createTaskWithProject(t, "user1", {
			title: "Task",
			parents: [p1.created.id, project!._id],
		});

		// Absolute replacement to another non-project parent plus project
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: task.created.id,
			parents: [p2.created.id, project!._id],
		});

		const updated = await getTaskById(t, task.created.id);
		expect(updated!.parents).toEqual([p2.created.id]); // project should be dropped when another parent present
	});

	test("mixes strings and delta operations for parents", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");
		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });
		const p2 = await createTaskWithProject(t, "user1", { title: "P2", parents: [project!._id] });
		const p3 = await createTaskWithProject(t, "user1", { title: "P3", parents: [project!._id] });
		const p4 = await createTaskWithProject(t, "user1", { title: "P4", parents: [project!._id] });

		const task = await createTaskWithProject(t, "user1", { title: "Task", parents: [project!._id] });

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

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", { title: "C1", parents: [project!._id] });
		const c2 = await createTaskWithProject(t, "user1", { title: "C2", parents: [project!._id] });
		const c3 = await createTaskWithProject(t, "user1", { title: "C3", parents: [project!._id] });
		const c4 = await createTaskWithProject(t, "user1", { title: "C4", parents: [project!._id] });

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

		const project = await createProject(t, "user1");

		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });
		const p2 = await createTaskWithProject(t, "user1", { title: "P2", parents: [project!._id] });
		const p3 = await createTaskWithProject(t, "user1", { title: "P3", parents: [project!._id] });
		const p4 = await createTaskWithProject(t, "user1", { title: "P4", parents: [project!._id] });
		const p5 = await createTaskWithProject(t, "user1", { title: "P5", parents: [project!._id] });

		const task = await createTaskWithProject(t, "user1", { title: "Task", parents: [project!._id] });

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

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", { title: "C1", parents: [project!._id] });

		const c2 = await createTaskWithProject(t, "user1", { title: "C2", parents: [project!._id] });

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

		const task = await createTaskWithProject(t, "user1", { title: "User1 Task" });

		// Switch to user2
		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.tasks.updateTask, {
				...buildTaskUpdate(task.created.id, { title: "Hijacked" }),
			})
		).rejects.toThrow("Not owner");
	});

	test("throws InvalidStateError when modifying project parents", async () => {
		const t = createTestCtx();

		// Create project node
		const project = await createProject(t, "user1");

		await expect(
			t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
				id: String(project!._id),
				addParents: ["some_id"],
			})
		).rejects.toThrow();
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();

		const task = await createTaskWithProject(t, "user1");

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

		const t1 = await createTaskWithProject(t, "user1", { title: "T1" });
		const t2 = await createTaskWithProject(t, "user1", { title: "T2" });

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

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", { title: "C1", parents: [project!._id] });

		const c2 = await createTaskWithProject(t, "user1", { title: "C2", parents: [project!._id] });

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

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id],
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

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id],
		});

		await t.withIdentity(mockAuth("user1")).query(api.tasks.getTasks, { ids: [parent.created.id, child.created.id] });

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: parent.created.id });

		// Child should no longer reference parent
		const refreshedChild = await getTaskById(t, child.created.id);
		expect(refreshedChild!.parents).not.toContain(parent.created.id);

		// Child should be auto-attached to project ancestor
		expect(refreshedChild!.parents).toEqual([project!._id]);
		const proj = await getTaskById(t, project!._id as Id<"nodes">);
		expect(proj!.children).toContain(child.created.id);
	});

	test("reattaches grandchildren to project ancestor using first-parent chain when deleting middle node", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const grandParent = await createTaskWithProject(t, "user1", { title: "GP", parents: [project!._id] });
		const parent = await createTaskWithProject(t, "user1", { title: "P", parents: [grandParent.created.id] });
		const child = await createTaskWithProject(t, "user1", { title: "C", parents: [parent.created.id] });

		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTask, { id: parent.created.id });

		const refreshedChild = await getTaskById(t, child.created.id);
		const refreshedProject = await getTaskById(t, project!._id);

		expect(refreshedChild!.parents).toEqual([project!._id]);
		expect(refreshedProject!.children).toContain(child.created.id);
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

		const task = await createTaskWithProject(t, "user1");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.tasks.deleteTask, { id: task.created.id })
		).rejects.toThrow("Not owner");
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();

		const task = await createTaskWithProject(t, "user1");

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

		const project = await createProject(t, "user1");

		const t1 = await createTaskWithProject(t, "user1", { title: "T1", parents: [project!._id] });
		const t2 = await createTaskWithProject(t, "user1", { title: "T2", parents: [project!._id] });
		const t3 = await createTaskWithProject(t, "user1", { title: "T3", parents: [project!._id] });

		const result = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.deleteTasks, {
			ids: [t1.created.id, t2.created.id, t3.created.id],
		});

		// All should be deleted
		expect(await getTaskById(t, t1.created.id)).toBeNull();
		expect(await getTaskById(t, t2.created.id)).toBeNull();
		expect(await getTaskById(t, t3.created.id)).toBeNull();

		// Project should be in affected (deduplicated)
		const projectAffectedCount = result.affected.filter(
			(t) => t.id === project!._id
		).length;
		expect(projectAffectedCount).toBe(1);
	});

	test("deletes tasks with shared parent and deduplicates affected", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", {
			title: "C1",
			parents: [parent.created.id],
		});

		const c2 = await createTaskWithProject(t, "user1", {
			title: "C2",
			parents: [parent.created.id],
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

//#region Project invariants

describe("Project invariants", () => {
	test("allows multiple projects per user with no parents", async () => {
		const t = createTestCtx();

		const p1 = await createProject(t, "user1");
		const p2 = await createProject(t, "user1", { title: "Second" });

		expect(p1!._id).not.toBe(p2!._id);
		expect(p1!.parents).toHaveLength(0);
		expect(p2!.parents).toHaveLength(0);
	});

	test("getAllUserTasks does not return projects", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		await createTaskWithProject(t, "user1", { title: "Task", parents: [project!._id] });

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

		const project = await createProject(t, "user1");

		// Create hierarchy: project -> P1 -> C1 -> GC1 (all anchored to project)
		const p1 = await createTaskWithProject(t, "user1", { title: "P1", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", {
			title: "C1",
			parents: [p1.created.id, project!._id],
		});

		const gc1 = await createTaskWithProject(t, "user1", {
			title: "GC1",
			parents: [c1.created.id, project!._id],
		});

		// Move GC1 to be child of P1 instead (project anchor should remain)
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: gc1.created.id,
			parents: [p1.created.id, project!._id],
		});

		const updatedP1 = await getTaskById(t, p1.created.id);
		const updatedC1 = await getTaskById(t, c1.created.id);
		const updatedGC1 = await getTaskById(t, gc1.created.id);

		// P1 should have both C1 and GC1 as children
		expect(updatedP1!.children).toContain(c1.created.id);
		expect(updatedP1!.children).toContain(gc1.created.id);

		// C1 should no longer have GC1 as child
		expect(updatedC1!.children).not.toContain(gc1.created.id);

		// GC1 should have P1 (primary) and project anchor
		expect(updatedGC1!.parents).toEqual([p1.created.id, project!._id]);
	});

	test("propagates changes when adding child via parent", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", { title: "Child", parents: [project!._id] });

		// Add child via parent.children update
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: parent.created.id,
			addChildren: [child.created.id],
		});

		const updatedChild = await getTaskById(t, child.created.id);
		expect(updatedChild!.parents).toEqual([parent.created.id]); // project anchor should be dropped once non-project parent added
	});

	test("propagates changes when removing parent via child", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const parent = await createTaskWithProject(t, "user1", { title: "Parent", parents: [project!._id] });

		const child = await createTaskWithProject(t, "user1", {
			title: "Child",
			parents: [parent.created.id, project!._id],
		});

		// Remove parent via child.parents update
		await t.withIdentity(mockAuth("user1")).mutation(api.tasks.updateTask, {
			id: child.created.id,
			removeParents: [parent.created.id],
		});

		const updatedParent = await getTaskById(t, parent.created.id);
		expect(updatedParent!.children).not.toContain(child.created.id);

		const updatedChild = await getTaskById(t, child.created.id);
		expect(updatedChild!.parents).toEqual([project!._id]);
	});
});

//#endregion

//#region Cycle prevention

describe.skip("Cycle prevention", () => {
	test("detects and fails on simple cycle (A -> B -> A)", async () => {
		const t = createTestCtx();

		const project = await createProject(t, "user1");

		const a = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "A", parents: [project!._id] }),
		});

		const b = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "B",
				parents: [a.created.id, project!._id],
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

		const project = await createProject(t, "user1");

		const a = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({ title: "A", parents: [project!._id] }),
		});

		const b = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "B",
				parents: [a.created.id, project!._id],
			}),
		});

		const c = await t.withIdentity(mockAuth("user1")).mutation(api.tasks.createTask, {
			createDetail: buildTaskCreate({
				title: "C",
				parents: [b.created.id, project!._id],
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
		test("imports tasks with relationships where all referenced tasks are included", async () => {
			const t = createTestCtx();

			// Create export data with parent-child relationships
			const parentId = "exported_parent_1";
			const childId = "exported_child_1";
			const grandchildId = "exported_grandchild_1";

			const projectId = "export_project";
			const data: IAppNode<AppData<number>, number>[] = [
				{
					id: projectId,
					userAuthId: "original_user",
					parents: [],
					children: [parentId],
					created: new Date().getTime(),
					lastEdit: new Date().getTime(),
					data: {
						type: "project" as const,
						title: "Root Project",
						status: 0,
					}
				},
				{
					id: parentId,
					userAuthId: "original_user",
					parents: [projectId],
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
					parents: [parentId, projectId],
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
					parents: [childId, projectId],
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
		const projectId = "exported_project_1";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
				{
					id: projectId,
					userAuthId: "original_user",
					type: "project" as const,
					title: "Project",
					status: 0,
					parents: [],
					children: [parentId],
					created: new Date().toISOString(),
					lastEdit: new Date().toISOString(),
				},
					{
						id: parentId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Parent",
						status: 0,
					parents: [projectId], // anchor to project; missing parent removed
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
					parents: [parentId, missingParentId],
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
			const project = allTasks.find(t => t.data.title === "Project");

			expect(parent).toBeDefined();
			expect(child).toBeDefined();
			expect(project).toBeDefined();

			// Parent should have missingParentId removed from parents
			// Parent should have missingChildId removed from children
			// Parent should only have childId in children
			if (parent && child && project) {
				expect(parent.parents).toEqual([String(project._id)]);
				expect(parent.children).not.toContain(missingChildId);
				expect(parent.children).toContain(String(child._id));

				// Child should drop missing parent but keep real parent
				expect(child.parents).toContain(String(parent._id));
				expect(child.parents).not.toContain(missingParentId);

				// Verify bidirectional relationship
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
		const projectId = "proj_complex";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
				{
					id: projectId,
					userAuthId: "original_user",
					type: "project" as const,
					title: "Project",
					status: 0,
					parents: [],
					children: [task2Id],
					created: new Date().toISOString(),
					lastEdit: new Date().toISOString(),
				},
					{
						id: task1Id,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Task 1",
						status: 0,
					parents: [task2Id, projectId], // parent chain through task2 -> project
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
					parents: [projectId],
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
						parents: [task1Id, projectId],
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

		// Create some existing tasks (with project context)
		const existingProject = await createProject(t, "user1");
		await createTaskWithProject(t, "user1", { title: "Existing 1", parents: [existingProject!._id] });
		await createTaskWithProject(t, "user1", { title: "Existing 2", parents: [existingProject!._id] });

			// Verify they exist
			let allTasks = await getAllTasksForUser(t, "user1");
			expect(allTasks.length).toBeGreaterThanOrEqual(2);

			// Import new tasks
			const parentId = "imported_parent";
			const childId = "imported_child";
		const projectId = "imported_project";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
			tasks: [
				{
					id: projectId,
					userAuthId: "original_user",
					type: "project" as const,
					title: "Imported Project",
					status: 0,
					parents: [],
					children: [parentId],
					created: new Date().toISOString(),
					lastEdit: new Date().toISOString(),
				},
					{
						id: parentId,
						userAuthId: "original_user",
						type: "task" as const,
						title: "Imported Parent",
						status: 0,
					parents: [projectId],
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
					parents: [parentId, projectId],
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

		// Should only have imported tasks and project
		allTasks = await getAllTasksForUser(t, "user1");
		const taskTasks = allTasks.filter(t => t.data.type === "task");
		const projects = allTasks.filter(t => t.data.type === "project");
		expect(taskTasks).toHaveLength(2);
		expect(projects).toHaveLength(1);

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

		const projectId = "proj_single";

			const exportData = {
				version: "0.0.0",
				exportedAt: new Date().toISOString(),
				tasks: [
				{
					id: projectId,
					userAuthId: "original_user",
					type: "project" as const,
					title: "Orphan Project",
					status: 0,
					parents: [],
					children: ["task_1"],
					created: new Date().toISOString(),
					lastEdit: new Date().toISOString(),
				},
					{
						id: "task_1",
						userAuthId: "original_user",
						type: "task" as const,
						title: "Orphan Task",
						status: 0,
					parents: [projectId],
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
		const project = allTasks.find(t => t.data.title === "Orphan Project");
			expect(orphan).toBeDefined();
		expect(project).toBeDefined();
		if (orphan && project) {
			expect(orphan.parents).toEqual([String(project._id)]);
		}
		});
	});

	test("exports data and imports it back correctly (Round Trip)", async () => {
		const t = createTestCtx();

		// 1. Setup: Create a complex graph of tasks with a project ancestor
		const project = await createProject(t, "user1");

		// Structure: P1 -> C1 -> GC1; ORPH attached to project directly
		const p1 = await createTaskWithProject(t, "user1", { title: "RT Parent", parents: [project!._id] });

		const c1 = await createTaskWithProject(t, "user1", {
			title: "RT Child",
			parents: [p1.created.id],
		});

		await createTaskWithProject(t, "user1", {
			title: "RT Grandchild",
			parents: [c1.created.id],
		});

		await createTaskWithProject(t, "user1", { title: "RT Orphan", parents: [project!._id] });

		// Verify setup
		const initialTasks = await getAllTasksForUser(t, "user1", true);
		expect(initialTasks).toHaveLength(4);

		// 2. Export
		const exportResult = await t.withIdentity(mockAuth("user1")).query(api.tasks.exportData, {});

		// Export includes the project + 4 created tasks = 5 nodes
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
		const restoredTasks = await getAllTasksForUser(t, "user1", true); // true = exclude projects
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

		// Orphan (project-attached) should not be connected to others beyond project ancestor
		expect(rOrphan!.children).toHaveLength(0);
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
				parents: [],
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
			}) as Id<"nodes">;

			childB = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [String(projectId)],
				children: [],
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

			// Fix grandchild parent to childB + project anchor
			await ctx.db.patch(grandchild, { parents: [String(childB), String(projectId)] });
			await ctx.db.patch(childB, { children: [String(grandchild)] });

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

		const project = await createProject(t, "user1");

		// Create tasks that will form a cycle: A -> B -> A (both anchored to project)
		let taskAId: Id<"nodes">;
		let taskBId: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			// Create task A
			taskAId = await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [String(project!._id)],
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
				parents: [String(project!._id)],
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

			// Manually create cycle: A -> B -> A (keep project anchor on both)
			await ctx.db.patch(taskAId, {
				children: [String(taskBId)],
				parents: [String(taskBId), String(project!._id)],
			});
			await ctx.db.patch(taskBId, {
				children: [String(taskAId)],
				parents: [String(taskAId), String(project!._id)],
			});

			// Attach both to project children for reachability
			await ctx.db.patch(project!._id as Id<"nodes">, {
				children: [String(taskAId), String(taskBId)],
			});
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

		const project = await createProject(t, "user1");

		let taskAId: Id<"nodes">;
		let taskBId: Id<"nodes">;
		let taskCId: Id<"nodes">;

		await t.withIdentity(mockAuth("user1")).run(async (ctx) => {
			const now = Date.now();
			// Create three tasks
			taskAId = (await ctx.db.insert("nodes", {
				userAuthId: "user1",
				parents: [String(project!._id)],
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
				parents: [String(project!._id)],
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
				parents: [String(project!._id)],
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
				parents: [String(taskCId), String(project!._id)],
			});
			await ctx.db.patch(taskBId, {
				children: [String(taskCId)],
				parents: [String(taskAId), String(project!._id)],
			});
			await ctx.db.patch(taskCId, {
				children: [String(taskAId)],
				parents: [String(taskBId), String(project!._id)],
			});

			// Attach tasks to project children for reachability
			await ctx.db.patch(project!._id as Id<"nodes">, {
				children: [String(taskAId), String(taskBId), String(taskCId)],
			});
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