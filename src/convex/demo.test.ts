// convex/demo.test.ts
import { convexTest } from "convex-test";
import { describe, test, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { type Id } from "./_generated/dataModel";
import { ProjectStatus } from "$domain/models/project";
import { TaskStatus } from "$domain/models/task";
import { DEMO_GENIE_CONTENT, DEMO_TITLES } from "./demo";

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

async function createProject(t: TestContext, userId: string) {
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
				title: DEMO_TITLES.project,
				status: ProjectStatus.active,
			},
		});
		return (await ctx.db.get(id))!;
	});
}

/** Mirrors the walkthrough: project (A1) + "Get dress clothes" (B1), optionally the user-created genie (B6) */
async function setupDemo(t: TestContext, userId: string, { withGenie = false } = {}) {
	const project = await createProject(t, userId);
	const asUser = t.withIdentity(mockAuth(userId));
	const { created: dress } = await asUser.mutation(api.tasks.createTask, {
		createDetail: { title: DEMO_TITLES.dress, parents: [project._id] },
	});
	let genieId: string | undefined;
	if (withGenie) {
		const { created: genie } = await asUser.mutation(api.tasks.createTask, {
			createDetail: { title: DEMO_TITLES.genie, content: DEMO_GENIE_CONTENT, parents: [dress.id] },
		});
		genieId = genie.id;
	}
	return { projectId: project._id as string, dressId: dress.id, genieId, asUser };
}

async function getNode(t: TestContext, id: string) {
	return (await t.run(async (ctx) => await ctx.db.get(id as Id<"nodes">)))!;
}

async function getUserNodes(t: TestContext, userId: string) {
	return await t.run(async (ctx) => {
		const all = await ctx.db.query("nodes").collect();
		return all.filter(node => node.userAuthId === userId);
	});
}

async function titlesOf(t: TestContext, ids: string[]) {
	return await Promise.all(ids.map(async id => (await getNode(t, id)).data.title));
}

/** Asserts the full demo graph described in the wf-87q epic */
async function expectDemoGraph(t: TestContext, projectId: string, dressId: string, genieId: string) {
	const project = await getNode(t, projectId);
	expect(await titlesOf(t, project.children)).toEqual([DEMO_TITLES.dress, DEMO_TITLES.gift, DEMO_TITLES.transport]);
	const [, giftId, transportId] = project.children;

	const dress = await getNode(t, dressId);
	expect(dress.parents).toEqual([projectId]);
	expect(await titlesOf(t, dress.children)).toEqual([DEMO_TITLES.accessorize, DEMO_TITLES.tailor, DEMO_TITLES.shoes]);

	for (const id of dress.children) {
		const node = await getNode(t, id);
		expect(node.parents).toEqual([dressId]);
		expect(node.children).toEqual([genieId]);
		expect(node.data.status).toBe(TaskStatus.incomplete);
	}

	const gift = await getNode(t, giftId);
	expect(gift.data.status).toBe(TaskStatus.incomplete);
	expect(await titlesOf(t, gift.children)).toEqual([DEMO_TITLES.registry, DEMO_TITLES.genie]);
	expect(gift.children[1]).toBe(genieId);
	expect((await getNode(t, gift.children[0])).data.status).toBe(TaskStatus.complete);

	const transport = await getNode(t, transportId);
	expect(transport.data.status).toBe(TaskStatus.complete);
	expect(await titlesOf(t, transport.children)).toEqual([DEMO_TITLES.reminder]);
	const reminder = await getNode(t, transport.children[0]);
	expect(reminder.data.status).toBe(TaskStatus.complete);
	expect(reminder.parents).toEqual([transportId]);

	const genie = await getNode(t, genieId);
	expect(genie.data.title).toBe(DEMO_TITLES.genie);
	expect(genie.data.status).toBe(TaskStatus.incomplete);
	expect(genie.children).toEqual([]);
	expect([...genie.parents].sort()).toEqual([...dress.children, giftId].sort());
}

//#endregion


describe("seedDemoProject", () => {
	test("builds the demo graph and creates the genie when not provided", async () => {
		const t = createTestCtx();
		const { projectId, dressId, asUser } = await setupDemo(t, "user1");

		const result = await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId });

		expect(result.genieId).toBeTruthy();
		await expectDemoGraph(t, projectId, dressId, result.genieId!);

		// 8 created: 3 dress children, gift, registry, transport, reminder, genie
		expect(result.created).toHaveLength(8);
		expect(result.created.map(n => n.data.title).sort()).toEqual([
			DEMO_TITLES.accessorize, DEMO_TITLES.tailor, DEMO_TITLES.shoes,
			DEMO_TITLES.gift, DEMO_TITLES.registry, DEMO_TITLES.transport, DEMO_TITLES.reminder,
			DEMO_TITLES.genie,
		].sort());
		const createdGenie = result.created.find(n => n.id === result.genieId)!;
		expect(createdGenie.data.content).toBe(DEMO_GENIE_CONTENT);
		// Created nodes are reported in their final state
		const createdAccessorize = result.created.find(n => n.data.title === DEMO_TITLES.accessorize)!;
		expect(createdAccessorize.children).toEqual([result.genieId]);

		// Affected = pre-existing nodes modified (project + dress), not the created ones
		expect(result.affected.map(n => n.id).sort()).toEqual([projectId, dressId].sort());
		const affectedProject = result.affected.find(n => n.id === projectId)!;
		expect(affectedProject.children).toHaveLength(3);

		// Nothing extra left behind
		expect(await getUserNodes(t, "user1")).toHaveLength(10);
	});

	test("reuses a user-created genie and removes it as a direct child of dress", async () => {
		const t = createTestCtx();
		const { projectId, dressId, genieId, asUser } = await setupDemo(t, "user1", { withGenie: true });

		const result = await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId });

		expect(result.genieId).toBe(genieId);
		await expectDemoGraph(t, projectId, dressId, genieId!);
		expect((await getNode(t, genieId!)).data.content).toBe(DEMO_GENIE_CONTENT);

		expect(result.created).toHaveLength(7);
		expect(result.created.some(n => n.data.title === DEMO_TITLES.genie)).toBe(false);
		expect(result.affected.map(n => n.id).sort()).toEqual([projectId, dressId, genieId].sort());
		expect(await getUserNodes(t, "user1")).toHaveLength(10);
	});

	test("is idempotent: a second call writes nothing", async () => {
		const t = createTestCtx();
		const { projectId, dressId, genieId, asUser } = await setupDemo(t, "user1", { withGenie: true });

		await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId });
		const second = await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId });
		const third = await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId });

		expect(second).toEqual({ created: [], affected: [], genieId });
		expect(third).toEqual({ created: [], affected: [], genieId });
		expect(await getUserNodes(t, "user1")).toHaveLength(10);
		await expectDemoGraph(t, projectId, dressId, genieId!);
	});

	test("rejects another user's project", async () => {
		const t = createTestCtx();
		const { projectId, dressId } = await setupDemo(t, "user1");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.demo.seedDemoProject, { projectId, dressId })
		).rejects.toThrow(/Not owner of node/);
		expect(await getUserNodes(t, "user1")).toHaveLength(2);
		expect(await getUserNodes(t, "user2")).toHaveLength(0);
	});

	test("rejects another user's genie", async () => {
		const t = createTestCtx();
		const { projectId, dressId, asUser } = await setupDemo(t, "user1");
		const { genieId: otherGenieId } = await setupDemo(t, "user2", { withGenie: true });

		await expect(
			asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId: otherGenieId })
		).rejects.toThrow(/Not owner of node/);
		expect(await getUserNodes(t, "user1")).toHaveLength(2);
	});

	test("throws NotAuthorizedError when not authenticated", async () => {
		const t = createTestCtx();
		const { projectId, dressId } = await setupDemo(t, "user1");

		await expect(
			t.mutation(api.demo.seedDemoProject, { projectId, dressId })
		).rejects.toThrow(/Failed to get identity/);
	});

	test("rejects when projectId is not a project", async () => {
		const t = createTestCtx();
		const { dressId, asUser } = await setupDemo(t, "user1");

		await expect(
			asUser.mutation(api.demo.seedDemoProject, { projectId: dressId, dressId })
		).rejects.toThrow(/Node is not a project/);
	});

	test("rejects when dress is not a child of the project", async () => {
		const t = createTestCtx();
		const { projectId, asUser } = await setupDemo(t, "user1");
		const { dressId: otherDressId } = await setupDemo(t, "user1");

		await expect(
			asUser.mutation(api.demo.seedDemoProject, { projectId, dressId: otherDressId })
		).rejects.toThrow(/not a child of the project/);
	});

	test("planner suggests only the genie after seeding, then its parents once it is complete", async () => {
		const t = createTestCtx();
		const { projectId, dressId, genieId, asUser } = await setupDemo(t, "user1", { withGenie: true });
		await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId });

		const before = await asUser.query(api.tasks.getPrioritizedTasks, { projectId, limit: 10 });
		expect(before.map(n => n.id)).toEqual([genieId]);

		await asUser.mutation(api.tasks.updateTask, { id: genieId!, status: TaskStatus.complete });

		const after = await asUser.query(api.tasks.getPrioritizedTasks, { projectId, limit: 10 });
		expect(after.map(n => n.data.title)).toEqual([
			DEMO_TITLES.accessorize,
			DEMO_TITLES.tailor,
			DEMO_TITLES.shoes,
			DEMO_TITLES.gift,
		]);
	});

	/* KNOWN GAP (see bd follow-up discovered from wf-87q.3): deleteTask is not recursive.
	Deleting a project removes only the project node; its descendants are left behind,
	still pointing at the deleted project. Flip `test.fails` -> `test` once fixed. */
	test.fails("deleting the project via deleteTask removes the whole demo subtree", async () => {
		const t = createTestCtx();
		const { projectId, dressId, genieId, asUser } = await setupDemo(t, "user1", { withGenie: true });
		await asUser.mutation(api.demo.seedDemoProject, { projectId, dressId, genieId });

		await asUser.mutation(api.tasks.deleteTask, { id: projectId });

		expect(await getUserNodes(t, "user1")).toHaveLength(0);
	});
});
