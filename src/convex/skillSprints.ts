import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

type SprintDoc = Doc<"skillSprints">;
type PlanDoc = Doc<"skillSprintPlans">;
type AdjustmentDoc = Doc<"skillSprintAdjustments">;
type DailyChallengeDoc = Doc<"skillSprintDailyChallenges">;
type JournalEntryDoc = Doc<"skillSprintJournalEntries">;

async function getUserAuthIdOrThrow(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
	}
	return identity.subject;
}

type AuthDbCtx = Pick<MutationCtx | QueryCtx, "auth" | "db">;

async function getOwnedSprintOrThrow(ctx: AuthDbCtx, sprintId: Id<"skillSprints">): Promise<SprintDoc> {
	const userAuthId = await getUserAuthIdOrThrow(ctx);
	const sprint = await ctx.db.get(sprintId);
	if (!sprint) {
		throw new ConvexError({ type: "NotFoundError", msg: "Sprint not found", ctx: { sprintId } });
	}
	if (sprint.userAuthId !== userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of sprint", ctx: { sprintId } });
	}
	return sprint;
}

export const createSprint = mutation({
	args: {
		title: v.string(),
		goal: v.string(),
		startsAt: v.number(),
		endsAt: v.number(),
	},
	handler: async (ctx, args) => {
		const userAuthId = await getUserAuthIdOrThrow(ctx);
		const now = Date.now();
		const id = await ctx.db.insert("skillSprints", {
			userAuthId,
			title: args.title,
			goal: args.goal,
			startsAt: args.startsAt,
			endsAt: args.endsAt,
			archivedAt: undefined,
			createdAt: now,
		});
		const sprint = await ctx.db.get(id);
		if (!sprint) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created sprint", ctx: { id } });
		return sprint;
	},
});

export const updateSprint = mutation({
	args: {
		sprintId: v.id("skillSprints"),
		title: v.optional(v.string()),
		goal: v.optional(v.string()),
		startsAt: v.optional(v.number()),
		endsAt: v.optional(v.number()),
		archivedAt: v.optional(v.number()),
	},
	handler: async (ctx, { sprintId, ...updates }) => {
		await getOwnedSprintOrThrow(ctx, sprintId);
		await ctx.db.patch(sprintId, updates);
		const updated = await ctx.db.get(sprintId);
		if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated sprint", ctx: { sprintId } });
		return updated;
	},
});

export const getSprint = query({
	args: { sprintId: v.id("skillSprints") },
	handler: async (ctx, { sprintId }) => {
		return await getOwnedSprintOrThrow(ctx, sprintId);
	},
});

export const setPlan = mutation({
	args: {
		sprintId: v.id("skillSprints"),
		md: v.string(),
	},
	handler: async (ctx, { sprintId, md }) => {
		await getOwnedSprintOrThrow(ctx, sprintId);
		const now = Date.now();

		const existing = await ctx.db
			.query("skillSprintPlans")
			.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
			.unique();

		if (!existing) {
			const id = await ctx.db.insert("skillSprintPlans", {
				sprintId,
				md,
				version: 1,
				updatedAt: now,
			});
			const created = await ctx.db.get(id);
			if (!created) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created plan", ctx: { id } });
			return created;
		}

		const nextVersion = existing.version + 1;
		await ctx.db.patch(existing._id, { md, version: nextVersion, updatedAt: now });
		const updated = await ctx.db.get(existing._id);
		if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated plan", ctx: { id: existing._id } });
		return updated;
	},
});

export const addAdjustment = mutation({
	args: { sprintId: v.id("skillSprints"), md: v.string() },
	handler: async (ctx, { sprintId, md }) => {
		await getOwnedSprintOrThrow(ctx, sprintId);
		const now = Date.now();
		const id = await ctx.db.insert("skillSprintAdjustments", { sprintId, md, createdAt: now });
		const created = await ctx.db.get(id);
		if (!created) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created adjustment", ctx: { id } });
		return created;
	},
});

export const upsertDailyChallenge = mutation({
	args: {
		sprintId: v.id("skillSprints"),
		dayKey: v.string(),
		planVersion: v.number(),
		items: v.array(
			v.object({
				id: v.string(),
				title: v.string(),
				detailsMd: v.optional(v.string()),
				completedAt: v.optional(v.number()),
			})
		),
	},
	handler: async (ctx, { sprintId, dayKey, planVersion, items }) => {
		await getOwnedSprintOrThrow(ctx, sprintId);
		const now = Date.now();

		const existing = await ctx.db
			.query("skillSprintDailyChallenges")
			.withIndex("by_sprintId_dayKey", (q) => q.eq("sprintId", sprintId).eq("dayKey", dayKey))
			.unique();

		if (!existing) {
			const id = await ctx.db.insert("skillSprintDailyChallenges", {
				sprintId,
				dayKey,
				generatedAt: now,
				planVersion,
				items,
			});
			const created = await ctx.db.get(id);
			if (!created) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created daily challenge", ctx: { id } });
			return created;
		}

		await ctx.db.patch(existing._id, { generatedAt: now, planVersion, items });
		const updated = await ctx.db.get(existing._id);
		if (!updated)
			throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated daily challenge", ctx: { id: existing._id } });
		return updated;
	},
});

export const addJournalEntry = mutation({
	args: {
		sprintId: v.id("skillSprints"),
		md: v.string(),
		dayKey: v.optional(v.string()),
	},
	handler: async (ctx, { sprintId, md, dayKey }) => {
		await getOwnedSprintOrThrow(ctx, sprintId);
		const now = Date.now();
		const id = await ctx.db.insert("skillSprintJournalEntries", { sprintId, md, dayKey, createdAt: now });
		const created = await ctx.db.get(id);
		if (!created) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created journal entry", ctx: { id } });
		return created;
	},
});

export const listUserSprints = query({
	args: {},
	handler: async (ctx) => {
		const userAuthId = await getUserAuthIdOrThrow(ctx);
		const sprints = await ctx.db
			.query("skillSprints")
			.withIndex("by_user", (q) => q.eq("userAuthId", userAuthId))
			.collect();
		return sprints;
	},
});

export const getSprintState = query({
	args: { sprintId: v.id("skillSprints") },
	handler: async (ctx, { sprintId }) => {
		const sprint = await getOwnedSprintOrThrow(ctx, sprintId);

		const [plan, adjustments, dailyChallenges, journalEntries] = await Promise.all([
			ctx.db
				.query("skillSprintPlans")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.unique() as Promise<PlanDoc | null>,
			ctx.db
				.query("skillSprintAdjustments")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect() as Promise<AdjustmentDoc[]>,
			ctx.db
				.query("skillSprintDailyChallenges")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect() as Promise<DailyChallengeDoc[]>,
			ctx.db
				.query("skillSprintJournalEntries")
				.withIndex("by_sprintId", (q) => q.eq("sprintId", sprintId))
				.collect() as Promise<JournalEntryDoc[]>,
		]);

		return { sprint, plan: plan ?? undefined, adjustments, dailyChallenges, journalEntries };
	},
});

