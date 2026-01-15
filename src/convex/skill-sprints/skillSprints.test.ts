import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

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

async function seedSprint(t: TestContext, userAuthId: string) {
	return await t.withIdentity(mockAuth(userAuthId)).mutation(api.skillSprints.createSprint, {
		title: "Guitar",
		goal: "Improvise over changes",
		startsAt: Date.now(),
		endsAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
	});
}

describe("Skill Sprint persistence layer", () => {
	test("createSprint creates sprint owned by authenticated user", async () => {
		const t = createTestCtx();

		const sprint = await seedSprint(t, "user1");
		expect(sprint.userAuthId).toBe("user1");
		expect(sprint.title).toBe("Guitar");
		expect(typeof sprint.createdAt).toBe("number");
		expect(sprint.archivedAt).toBeUndefined();

		const fetched = await t.withIdentity(mockAuth("user1")).query(api.skillSprints.getSprint, { sprintId: sprint._id });
		expect(fetched._id).toBe(sprint._id);
	});

	test("mutations enforce ownership", async () => {
		const t = createTestCtx();
		const sprint = await seedSprint(t, "user1");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.skillSprints.setPlan, { sprintId: sprint._id, md: "plan" })
		).rejects.toThrow("Not owner");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.skillSprints.addAdjustment, { sprintId: sprint._id, md: "adjust" })
		).rejects.toThrow("Not owner");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.skillSprints.addJournalEntry, { sprintId: sprint._id, md: "journal" })
		).rejects.toThrow("Not owner");

		await expect(
			t.withIdentity(mockAuth("user2")).mutation(api.skillSprints.upsertDailyChallenge, {
				sprintId: sprint._id,
				dayKey: "2026-01-12",
				planVersion: 1,
				items: [{ id: "a", title: "Do 10 minutes", detailsMd: undefined, completedAt: undefined }],
			})
		).rejects.toThrow("Not owner");
	});

	test("setPlan overwrites md and increments version", async () => {
		const t = createTestCtx();
		const sprint = await seedSprint(t, "user1");

		const p1 = await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.setPlan, {
			sprintId: sprint._id,
			md: "v1",
		});
		expect(p1.version).toBe(1);
		expect(p1.md).toBe("v1");

		const p2 = await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.setPlan, {
			sprintId: sprint._id,
			md: "v2",
		});
		expect(p2.version).toBe(2);
		expect(p2.md).toBe("v2");

		// one plan doc per sprint (overwrite in-place)
		const planDocs = await t.run(async (ctx) => {
			return await ctx.db
				.query("skillSprintPlans")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprint._id))
				.collect();
		});
		expect(planDocs).toHaveLength(1);
	});

	test("upsertDailyChallenge is unique by sprintId + dayKey", async () => {
		const t = createTestCtx();
		const sprint = await seedSprint(t, "user1");

		const c1 = await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.upsertDailyChallenge, {
			sprintId: sprint._id,
			dayKey: "2026-01-12",
			planVersion: 1,
			items: [{ id: "a", title: "A", detailsMd: undefined, completedAt: undefined }],
		});

		const c2 = await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.upsertDailyChallenge, {
			sprintId: sprint._id,
			dayKey: "2026-01-12",
			planVersion: 2,
			items: [{ id: "b", title: "B", detailsMd: "details", completedAt: Date.now() }],
		});

		expect(c2._id).toBe(c1._id);
		expect(c2.planVersion).toBe(2);
		expect(c2.items[0]?.id).toBe("b");

		const challengeDocs = await t.run(async (ctx) => {
			return await ctx.db
				.query("skillSprintDailyChallenges")
				.withIndex("by_sprintId_dayKey", (q) => q.eq("sprintId", sprint._id).eq("dayKey", "2026-01-12"))
				.collect();
		});
		expect(challengeDocs).toHaveLength(1);
	});

	test("getSprintState returns sprint + related docs", async () => {
		const t = createTestCtx();
		const sprint = await seedSprint(t, "user1");

		await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.setPlan, { sprintId: sprint._id, md: "plan v1" });
		await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.addAdjustment, { sprintId: sprint._id, md: "adj 1" });
		await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.addJournalEntry, { sprintId: sprint._id, md: "journal 1" });
		await t.withIdentity(mockAuth("user1")).mutation(api.skillSprints.upsertDailyChallenge, {
			sprintId: sprint._id,
			dayKey: "2026-01-12",
			planVersion: 1,
			items: [{ id: "a", title: "A", detailsMd: undefined, completedAt: undefined }],
		});

		const state = await t.withIdentity(mockAuth("user1")).query(api.skillSprints.getSprintState, { sprintId: sprint._id });
		expect(state.sprint._id).toBe(sprint._id);
		expect(state.plan?.md).toBe("plan v1");
		expect(state.adjustments).toHaveLength(1);
		expect(state.dailyChallenges).toHaveLength(1);
		expect(state.journalEntries).toHaveLength(1);
	});
});

