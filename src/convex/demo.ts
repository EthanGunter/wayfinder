import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { TaskStatus } from "$domain/models/task";
import type { AppData, IAppNode } from "$domain/models/node";
import { _createTask, _updateTask, cleanNodeForClient, resolveProjectAncestor } from "./tasks";

//#region Types

type DBNode = Doc<'nodes'>;
type ClientNode = IAppNode<AppData<number>, number>;

//#endregion


//#region Demo data

/** Titles of the onboarding walkthrough's example project ("Go to the ball 💃🕺"). Keep verbatim. */
export const DEMO_TITLES = {
	project: "Go to the ball 💃🕺",
	dress: "Get dress clothes 🥿👗👔👞",
	accessorize: "Accessorize: 💍🎭👔",
	tailor: "Visit tailor or boutique 🧵",
	shoes: "Buy dress shoes 👞",
	gift: "Get a gift 🎁",
	registry: "Ask for registry password",
	transport: "Arrange transportation 🐭🚖",
	reminder: "Set departure reminder ⏰",
	genie: "Ask a genie for money 🧞‍♂️💰",
} as const;

/** Matches the description the walkthrough prefills when the user creates the genie task themselves */
export const DEMO_GENIE_CONTENT = "This will take no time at all. It's fool-proof!";

//#endregion


//#region Mutators

/**
 * Seeds the onboarding walkthrough's example project (tutorial step B7).
 *
 * Expects the project and "Get dress clothes" (`dressId`, a direct child of the project) to already exist.
 * If the user already created "Ask a genie for money" (`genieId`), it is re-parented instead of duplicated.
 *
 * Resulting graph (children order = priority):
 * - Go to the ball -> [Get dress clothes, Get a gift, Arrange transportation (complete)]
 * - Get dress clothes -> [Accessorize, Visit tailor or boutique, Buy dress shoes]
 * - Accessorize / Visit tailor / Buy dress shoes -> [Ask a genie for money]
 * - Get a gift -> [Ask for registry password (complete), Ask a genie for money]
 * - Arrange transportation -> [Set departure reminder (complete)]
 *
 * Idempotent: if "Get dress clothes" already has seeded children, nothing is written and `created`/`affected` are empty.
 *
 * @returns `created`: final state of the nodes this call inserted.
 *  `affected`: final state of pre-existing nodes this call modified (project, dress, reused genie).
 *  `genieId`: id of "Ask a genie for money" (null only if already seeded and the genie can no longer be found).
 */
export const seedDemoProject = mutation({
	args: {
		projectId: v.string(),
		dressId: v.string(),
		genieId: v.optional(v.string()),
	},
	handler: async (ctx, { projectId, dressId, genieId }): Promise<{ created: ClientNode[], affected: ClientNode[], genieId: string | null }> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;

		// Validate project
		const project = await getOwnedNode(ctx, projectId, userAuthId);
		if (project.data.type !== "project") {
			throw new ConvexError({ type: "InvalidState", msg: "Node is not a project", ctx: projectId });
		}

		// Validate dress: a task directly under the project
		const dress = await getOwnedNode(ctx, dressId, userAuthId);
		if (dress.data.type !== "task") {
			throw new ConvexError({ type: "InvalidState", msg: "Node is not a task", ctx: dressId });
		}
		if (!dress.parents.includes(project._id) && !project.children.includes(dress._id)) {
			throw new ConvexError({ type: "InvalidState", msg: "Task is not a child of the project", ctx: dressId });
		}

		// Idempotency: already seeded if dress has any of the seeded children
		const seededTitles: string[] = [DEMO_TITLES.accessorize, DEMO_TITLES.tailor, DEMO_TITLES.shoes];
		const dressChildren = await getNodes(ctx, dress.children);
		const seededChild = dressChildren.find(c => seededTitles.includes(c.data.title));
		if (seededChild) {
			const existingGenie = (await getNodes(ctx, seededChild.children)).find(c => c.data.title === DEMO_TITLES.genie);
			let resolvedGenieId: string | null = existingGenie?._id ?? null;
			if (!resolvedGenieId && genieId && await ctx.db.get(genieId as Id<"nodes">)) resolvedGenieId = genieId;
			return { created: [], affected: [], genieId: resolvedGenieId };
		}

		// Validate the reused genie before writing anything
		if (genieId) {
			if (genieId === project._id || genieId === dress._id) {
				throw new ConvexError({ type: "InvalidState", msg: "Genie task cannot be the project or dress task", ctx: genieId });
			}
			const genie = await getOwnedNode(ctx, genieId, userAuthId);
			if (genie.data.type !== "task") {
				throw new ConvexError({ type: "InvalidState", msg: "Node is not a task", ctx: genieId });
			}
			const genieProject = await resolveProjectAncestor(ctx, genieId, userAuthId);
			if (genieProject._id !== project._id) {
				throw new ConvexError({ type: "InvalidState", msg: "Genie task belongs to another project", ctx: genieId });
			}
		}

		const createdIds: string[] = [];
		const touchedIds = new Set<string>();
		const create = async (title: string, parents: string[], status: TaskStatus = TaskStatus.incomplete, content?: string) => {
			const { created, affected } = await _createTask(ctx, { title, parents, status, content, userAuthId });
			createdIds.push(created.id);
			for (const a of affected) touchedIds.add(a.id);
			return created.id;
		};

		// Order of creation determines children order (priority)
		const accessorizeId = await create(DEMO_TITLES.accessorize, [dress._id]);
		const tailorId = await create(DEMO_TITLES.tailor, [dress._id]);
		const shoesId = await create(DEMO_TITLES.shoes, [dress._id]);

		const giftId = await create(DEMO_TITLES.gift, [project._id]);
		await create(DEMO_TITLES.registry, [giftId], TaskStatus.complete);

		const transportId = await create(DEMO_TITLES.transport, [project._id], TaskStatus.complete);
		await create(DEMO_TITLES.reminder, [transportId], TaskStatus.complete);

		const genieParents = [accessorizeId, tailorId, shoesId, giftId];
		let finalGenieId: string;
		if (genieId) {
			// Re-parent: absolute parents assignment also removes it from dress (or wherever the user put it)
			const { updated, affected } = await _updateTask(ctx, { id: genieId, parents: genieParents });
			touchedIds.add(updated.id);
			for (const a of affected) touchedIds.add(a.id);
			finalGenieId = genieId;
		} else {
			finalGenieId = await create(DEMO_TITLES.genie, genieParents, TaskStatus.incomplete, DEMO_GENIE_CONTENT);
		}

		// Report final state; nodes touched mid-seed may have changed since their helper returned them
		const created = await getNodes(ctx, createdIds);
		const affected = await getNodes(ctx, [...touchedIds].filter(id => !createdIds.includes(id)));

		return {
			created: created.map(cleanNodeForClient),
			affected: affected.map(cleanNodeForClient),
			genieId: finalGenieId,
		};
	},
});

//#endregion


//#region Utilities

async function getOwnedNode(ctx: MutationCtx, id: string, userAuthId: string): Promise<DBNode> {
	const node = await ctx.db.get(id as Id<"nodes">);
	if (!node) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });
	if (node.userAuthId !== userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: id });
	}
	return node;
}

async function getNodes(ctx: MutationCtx, ids: string[]): Promise<DBNode[]> {
	const nodes = await Promise.all(ids.map(id => ctx.db.get(id as Id<"nodes">)));
	return nodes.filter((n): n is DBNode => !!n);
}

//#endregion
