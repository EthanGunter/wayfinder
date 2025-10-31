import { Err, NotAuthorizedError, NotFoundError, NotImplementedError } from "$domain/errors";
import { type Doc, type Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { calculateRelationshipChanges, relationshipChangesToUpdateParams, type SharedTask as SystemAgnosticTask } from "$domain/models/task";


//#region Utility

type DBTask = Doc<'tasks'>;
const argsCreateTask = v.object({
	userAuthId: v.string(),
	title: v.string(),
	content: v.optional(v.string()),
	priority: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	parents: v.optional(v.array(v.string())),
	children: v.optional(v.array(v.string())),
})

//#endregion


//#region Convex API (queries & mutations)

export const createTask = mutation({
	args: {
		createDetail: argsCreateTask,
	},
	handler: async (ctx, { createDetail }) => {
		console.log('createTask', createDetail);

		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.subject !== createDetail.userAuthId) {
			console.log(`${identity}, ${identity?.subject}, ${createDetail.userAuthId}`);

			return { ok: false as const, error: serializeError(new NotAuthorizedError("Invalid user context", createDetail.userAuthId)) };
		}

		const now = Date.now();
		const row: Omit<Doc<"tasks">, "_id" | "_creationTime"> = {
			userAuthId: createDetail.userAuthId,
			title: createDetail.title,
			content: createDetail.content,
			status: 0,
			todaysTask: undefined,
			priority: createDetail.priority ?? 0,
			parents: createDetail.parents ?? [],
			children: createDetail.children ?? [],
			lastEdit: now,
		};
		console.log('row', row);

		const _id = await ctx.db.insert("tasks", row);
		const inserted = await ctx.db.get(_id);
		console.log('inserted', inserted);

		// Handle relationship updates
		const affectedTasks = [inserted];
		if ((createDetail.parents?.length ?? 0) > 0 || (createDetail.children?.length ?? 0) > 0) {
			const newTask = convertToTaskBase(inserted!);
			const relationshipChanges = calculateRelationshipChanges<number>({
				oldTask: null,
				newTask
			});
			const updateParams = relationshipChangesToUpdateParams(relationshipChanges);

			for (const update of updateParams) {
				const relatedTaskId = update.id as Id<"tasks">;
				const result = await applyTaskUpdate(ctx, { id: relatedTaskId, relations: update.relations });
				if (result.ok) {
					affectedTasks.push(result.value);
				}
			}
		}

		return {
			ok: true as const,
			value: {
				oldId: "",
				newId: "" + inserted!._id,
				affectedTasks,
			},
		};
	},
});

export const createTasks = mutation({
	args: {
		createDetails: v.array(argsCreateTask),
	},
	handler: async (ctx, { createDetails }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { ok: false as const, error: serializeError(new NotAuthorizedError("Not authenticated")) };
		}
		for (const d of createDetails) {
			if (d.userAuthId !== identity.subject) {
				return { ok: false as const, error: serializeError(new NotAuthorizedError("Invalid user context for batch")) };
			}
		}

		const now = Date.now();
		const insertedTasks = [];
		for (const d of createDetails) {
			const _id = await ctx.db.insert("tasks", {
				userAuthId: d.userAuthId,
				title: d.title,
				content: d.content,
				status: 0,
				todaysTask: undefined,
				priority: d.priority ?? 0,
				parents: d.parents ?? [],
				children: d.children ?? [],
				lastEdit: now,
			} as Omit<Doc<"tasks">, "_id" | "_creationTime">);
			const row = await ctx.db.get(_id);
			insertedTasks.push(row);
		}

		// Handle relationship updates for all created tasks
		const relationshipUpdates = calculateRelationshipChanges<number>(
			insertedTasks.map(task => ({
				oldTask: null,
				newTask: convertToTaskBase(task!)
			}))
		);
		const updateParams = relationshipChangesToUpdateParams(relationshipUpdates);
		const affectedTasks = [...insertedTasks];

		for (const update of updateParams) {
			const relatedTaskId = update.id as Id<"tasks">;
			const result = await applyTaskUpdate(ctx, { id: relatedTaskId, relations: update.relations });
			if (result.ok) {
				affectedTasks.push(result.value);
			}
		}

		return { ok: true as const, value: { updatedIds: [] as [string, string][], affectedTasks } };
	},
});

export const getTask = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		const row = await ctx.db.get(id);
		if (!row) {
			return { ok: false as const, error: serializeError(new NotFoundError("Task not found", "" + id)) };
		}
		return { ok: true as const, value: row };
	},
});

export const getTasks = query({
	args: { ids: v.array(v.id("tasks")) },
	handler: async (ctx, { ids }) => {
		const rows = await Promise.all(ids.map((i) => ctx.db.get(i)));
		const found = rows.filter(Boolean) as Doc<"tasks">[];
		if (found.length !== ids.length) {
			return { ok: false as const, error: serializeError(new NotFoundError("Some tasks not found", ids.map((x) => "" + x).join(","))) };
		}
		return { ok: true as const, value: found };
	},
});

export const getAllUserTasks = query({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_user", (q) => q.eq("userAuthId", userId))
			.collect();
		return { ok: true as const, value: rows };
	},
});

export const updateTask = mutation({
	args: {
		update: v.object({
			id: v.id("tasks"),
			data: v.optional(v.any()),
			relations: v.optional(
				v.array(
					v.object({
						id: v.string(),
						operation: v.union(
							v.literal("addChild"),
							v.literal("removeChild"),
							v.literal("addParent"),
							v.literal("removeParent")
						),
					})
				)
			),
		}),
	},
	handler: async (ctx, { update }) => {
		// Get the old state before the update
		const oldTask = await ctx.db.get(update.id);
		if (!oldTask) {
			return { ok: false as const, error: serializeError(new NotFoundError("Task not found for update", "" + update.id)) };
		}

		// Apply the main update
		const result = await applyTaskUpdate(ctx, update);
		if (!result.ok) return result;

		// Calculate and apply relationship changes
		const newTask = result.value;
		const relationshipChanges = calculateRelationshipChanges<number>({
			oldTask: convertToTaskBase(oldTask),
			newTask: convertToTaskBase(newTask)
		});
		const updateParams = relationshipChangesToUpdateParams(relationshipChanges);

		for (const relUpdate of updateParams) {
			const relatedTaskId = relUpdate.id as Id<"tasks">;
			await applyTaskUpdate(ctx, { id: relatedTaskId, relations: relUpdate.relations });
		}

		return result;
	},
});

export const updateTasks = mutation({
	args: {
		updates: v.array(
			v.object({
				id: v.id("tasks"),
				data: v.optional(v.any()),
				relations: v.optional(
					v.array(
						v.object({
							id: v.string(),
							operation: v.union(
								v.literal("addChild"), v.literal("removeChild"), v.literal("addParent"), v.literal("removeParent")
							),
						})
					)
				),
			})
		),
	},
	handler: async (ctx, { updates }) => {
		// Collect old states
		const oldStates = new Map<string, DBTask>();
		for (const u of updates) {
			const oldTask = await ctx.db.get(u.id);
			if (oldTask) {
				oldStates.set("" + u.id, oldTask);
			}
		}

		// Apply all main updates
		const results: DBTask[] = [];
		for (const u of updates) {
			const res = await applyTaskUpdate(ctx, u);
			if (!res.ok) return res;
			results.push(res.value);
		}

		// Calculate all relationship changes
		const allRelationshipChanges = calculateRelationshipChanges<number>(
			results.map(newTask => ({
				oldTask: oldStates.get("" + newTask._id) ? convertToTaskBase(oldStates.get("" + newTask._id)!) : null,
				newTask: convertToTaskBase(newTask)
			}))
		);
		const updateParams = relationshipChangesToUpdateParams(allRelationshipChanges);

		// Apply relationship updates
		for (const relUpdate of updateParams) {
			const relatedTaskId = relUpdate.id as Id<"tasks">;
			await applyTaskUpdate(ctx, { id: relatedTaskId, relations: relUpdate.relations });
		}

		return { ok: true as const, value: results };
	},
});

export const deleteTask = mutation({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		const row = await ctx.db.get(id);
		if (!row) return { ok: false as const, error: serializeError(new NotFoundError("Task not found", "" + id)) };
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.subject !== row.userAuthId) {
			return { ok: false as const, error: serializeError(new NotAuthorizedError("Not owner of task", "" + id)) };
		}

		// Calculate relationship changes before deletion
		const relationshipChanges = calculateRelationshipChanges<number>({
			oldTask: convertToTaskBase(row),
			newTask: null
		});
		const updateParams = relationshipChangesToUpdateParams(relationshipChanges);

		// Delete the task
		await ctx.db.delete(id);

		// Update related tasks
		for (const relUpdate of updateParams) {
			const relatedTaskId = relUpdate.id as Id<"tasks">;
			await applyTaskUpdate(ctx, { id: relatedTaskId, relations: relUpdate.relations });
		}

		return { ok: true as const, value: undefined };
	},
});

export const deleteTasks = mutation({
	args: { ids: v.array(v.id("tasks")) },
	handler: async (ctx, { ids }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { ok: true as const, value: undefined };
		}

		// Collect tasks to delete
		const tasksToDelete: DBTask[] = [];
		for (const id of ids) {
			const row = await ctx.db.get(id);
			if (row && row.userAuthId === identity.subject) {
				tasksToDelete.push(row);
			}
		}

		// Calculate all relationship changes
		const relationshipChanges = calculateRelationshipChanges<number>(
			tasksToDelete.map(task => ({
				oldTask: convertToTaskBase(task),
				newTask: null
			}))
		);
		const updateParams = relationshipChangesToUpdateParams(relationshipChanges);

		// Delete all tasks
		for (const task of tasksToDelete) {
			await ctx.db.delete(task._id);
		}

		// Update related tasks
		for (const relUpdate of updateParams) {
			const relatedTaskId = relUpdate.id as Id<"tasks">;
			await applyTaskUpdate(ctx, { id: relatedTaskId, relations: relUpdate.relations });
		}

		return { ok: true as const, value: undefined };
	},
});

export const getChildrenOf = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		const parent = await ctx.db.get(id);
		if (!parent) return { ok: false as const, error: serializeError(new NotFoundError("Task not found", "" + id)) };
		const childIds = parent.children ?? [];
		if (childIds.length === 0) return { ok: true as const, value: [] };
		const tasks = await ctx.db.query("tasks").collect();
		const filtered = tasks.filter((t) => childIds.includes("" + t._id));
		return { ok: true as const, value: filtered };
	},
});

export const getParentsOf = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		const child = await ctx.db.get(id);
		if (!child) return { ok: false as const, error: serializeError(new NotFoundError("Task not found", "" + id)) };
		const parentIds = child.parents ?? [];
		if (parentIds.length === 0) return { ok: true as const, value: [] };
		const tasks = await ctx.db.query("tasks").collect();
		const filtered = tasks.filter((t) => parentIds.includes("" + t._id));
		return { ok: true as const, value: filtered };
	},
});

export const getRootTasks = query({
	args: {},
	handler: async (ctx) => {
		const tasks = await ctx.db.query("tasks").collect();
		const roots = tasks.filter((t) => t.parents.length === 0);
		return { ok: true as const, value: roots };
	},
});

export const getTodaysTasks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { ok: true as const, value: [] };
		const now = new Date();
		const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
		const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_todays_task", (q) => q.eq("userAuthId", identity.subject).gte("todaysTask", start).lt("todaysTask", next))
			.collect();
		return { ok: true as const, value: rows };
	},
});

export const getPrioritizedTasks = query({
	args: { limit: v.number() },
	handler: async (ctx, { limit }) => {
		const rows = await ctx.db.query("tasks").collect();
		const tasks = rows;
		const roots = tasks.filter((t) => (t.parents?.length ?? 0) === 0);
		const tasksMap = new Map(tasks.map((t) => [t._id, t] as [string, DBTask]));
		const sorter = (a?: DBTask, b?: DBTask) => {
			if (!a) return -1; if (!b) return 1; return (b.priority ?? 0) - (a.priority ?? 0);
		};
		const todo: DBTask[] = [];
		const walk = (task: DBTask) => {
			if (todo.length === limit) return;
			if (task.children.length === 0) {
				if (task.status === 0) todo.push(task);
			} else {
				const children = task.children.map((id) => tasksMap.get(id)).sort(sorter);
				for (const c of children) { if (c && c.status === 0) walk(c); }
				if (children.every((c) => !c || c.status !== 0) && task.status === 0) todo.push(task);
			}
		};
		roots.sort(sorter); for (const r of roots) { if (todo.length === limit) break; walk(r); }
		return { ok: true as const, value: todo };
	},
});

export const searchTasks = query({
	args: { searchTerm: v.string() },
	handler: async (_ctx, _args) => {
		return { ok: false as const, error: serializeError(new NotImplementedError("Convex.tasks.searchTasks")) };
	},
});

//#endregion


//#region Utilities

function serializeError<T extends Err>(err: T): T {
	return JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
}

function convertToTaskBase(task: DBTask): SystemAgnosticTask<number> {
	return {
		id: task._id,
		userAuthId: task.userAuthId,

		title: task.title,
		content: task.content,
		status: task.status,

		todaysTask: task.todaysTask,
		priority: task.priority,
		dueDate: task.dueDate,
		parents: task.parents,
		children: task.children,

		created: task._creationTime,
		lastEdit: task.lastEdit
	};
}

async function applyTaskUpdate(ctx: any, update: { id: Id<"tasks">; data?: Partial<DBTask>; relations?: { id: string; operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[]; }) {
	const current = await ctx.db.get(update.id);
	if (!current) {
		return { ok: false as const, error: serializeError(new NotFoundError("Task not found for update", "" + update.id)) };
	}
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== current.userAuthId) {
		return { ok: false as const, error: serializeError(new NotAuthorizedError("Not owner of task", "" + update.id)) };
	}

	let parents = [...(current.parents ?? [])];
	let children = [...(current.children ?? [])];
	for (const rel of update.relations ?? []) {
		switch (rel.operation) {
			case "addChild": if (!children.includes(rel.id)) children.push(rel.id); break;
			case "removeChild": children = children.filter((id: string) => id !== rel.id); break;
			case "addParent": if (!parents.includes(rel.id)) parents.push(rel.id); break;
			case "removeParent": parents = parents.filter((id: string) => id !== rel.id); break;
		}
	}
	const now = Date.now();
	const patch: Partial<Doc<"tasks">> = { lastEdit: now };
	const d = (update.data ?? {}) as Partial<DBTask>;
	if ("title" in d) patch.title = d.title!;
	if ("content" in d) patch.content = d.content;
	if ("status" in d) patch.status = d.status!;
	if ("todaysTask" in d && d.todaysTask !== undefined) patch.todaysTask = d.todaysTask;
	if ("priority" in d) patch.priority = d.priority;
	if ((update.relations ?? []).length > 0) { patch.parents = parents; patch.children = children; }

	await ctx.db.patch(update.id, patch);
	const refreshed = await ctx.db.get(update.id);
	return { ok: true as const, value: refreshed };
}

//#endregion