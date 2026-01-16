import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";

function createTestCtx() {
	return convexTest(schema, import.meta.glob("./**/*.*s"));
}

describe("Convex schema — Skill Sprint tables + indexes", () => {
	test("supports required indexes for Skill Sprint data access", async () => {
		const t = createTestCtx();

		await t.run(async (ctx) => {
			const now = Date.now();

			const sprintId = await ctx.db.insert("skillSprints", {
				userAuthId: "user1",
				title: "Guitar",
				goal: "Be able to improvise over changes",
				startsAt: now,
				endsAt: now + 7 * 24 * 60 * 60 * 1000,
				archivedAt: undefined,
				createdAt: now,
			});

			// sprints by user
			await ctx.db
				.query("skillSprints")
				.withIndex("by_user", (q) => q.eq("userAuthId", "user1"))
				.collect();

			// plans/adjustments/challenges/entries by sprintId
			await ctx.db
				.query("skillSprintPlans")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect();

			await ctx.db
				.query("skillSprintAdjustments")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect();

			await ctx.db
				.query("skillSprintJournalEntries")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect();

			// challenges queryable by sprintId + dateCreated (index existence only; uniqueness enforced in mutations)
			const dateCreated = now;
			await ctx.db.insert("skillSprintDailyChallenges", {
				sprintId,
				dateCreated,
				status: "pending",
				generatedAt: now,
				planVersion: 1,
				items: [{ id: "a", title: "Do 10 minutes of ear training", detailsMd: undefined, completedAt: undefined }],
			});

			const fetched = await ctx.db
				.query("skillSprintDailyChallenges")
				.withIndex("by_sprintId_dateCreated", (q) => q.eq("sprintId", sprintId).eq("dateCreated", dateCreated))
				.unique();

			expect(fetched?.sprintId).toBe(sprintId);
			expect(fetched?.dateCreated).toBe(dateCreated);
			expect(fetched?.status).toBe("pending");
		});
	});
});

