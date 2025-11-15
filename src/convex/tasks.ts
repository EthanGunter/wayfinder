import { Err, NotAuthorizedError, NotFoundError, NotImplementedError, InvalidStateError } from "$domain/errors";
import { type Doc, type Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { applyRelationshipOperations, calculateRelationshipUpdates, type CreateTaskParams, type UpdateTaskParams, type ITask } from "$domain/models/task";
import { type MutationCtx } from "./_generated/server";

//#region Types

type DBTask = Doc<'tasks'>;
type ClientTask = ITask<number>;
type CreateTaskArgs = Omit<CreateTaskParams<number>, "id"> & { id?: string };
type CreateTaskReturnType = ClientTask & { givenId: string | undefined }
const argsCreateTask = v.object({
	id: v.optional(v.string()),
	userAuthId: v.optional(v.string()),
	type: v.union(v.literal("task"), v.literal("root")),
	parents: v.optional(v.array(v.string())),
	children: v.optional(v.array(v.string())),
	title: v.string(),
	content: v.optional(v.string()),
	status: v.optional(v.number()),
	todaysTask: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	created: v.optional(v.number()),
	lastEdit: v.optional(v.number()),
})
const argsUpdateTask = v.object({
	id: v.string(),
	data: v.object({
		userAuthId: v.optional(v.string()),
		type: v.optional(v.union(v.literal("task"), v.literal("root"))),
		parents: v.optional(v.array(v.string())),
		addParents: v.optional(v.array(v.string())),
		removeParents: v.optional(v.array(v.string())),
		children: v.optional(v.array(v.string())),
		addChildren: v.optional(v.array(v.string())),
		removeChildren: v.optional(v.array(v.string())),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		status: v.optional(v.number()),
		todaysTask: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		created: v.optional(v.number()),
		lastEdit: v.optional(v.number()),
	})
})

//#endregion


//#region Mutators

export const createTask = mutation({
	args: {
		createDetail: argsCreateTask,
	},
	handler: async (ctx, { createDetail }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;

		const result = await _createTask(ctx, { ...createDetail, userAuthId, id: createDetail.id! });
		return result;
	},
});

export const createTasks = mutation({
	args: {
		createDetails: v.array(argsCreateTask),
	},
	handler: async (ctx, { createDetails }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;
		const created: CreateTaskReturnType[] = [];
		let affected: ClientTask[] = [];
		for (const createDetail of createDetails) {
			const { created: createdTask, affected: affectedTasks } = await _createTask(ctx, { ...createDetail, userAuthId });
			created.push(createdTask);
			affected.push(...affectedTasks);
		}

		// Dedup affected
		affected = affected.filter((t, index, self) => self.findIndex(t2 => t2.id === t.id) === index);

		return {
			created,
			affected
		};
	},
});

async function _createTask(ctx: MutationCtx, createDetail: CreateTaskArgs): Promise<{ created: CreateTaskReturnType, affected: ClientTask[] }> {
	const now = Date.now();

	// Normalize parents (attach to root if empty)
	let finalParents = createDetail.parents ?? [];
	if (finalParents.length === 0) {
		const rootTask = await getOrCreateRoot(ctx, createDetail.userAuthId);
		finalParents = [rootTask._id];
	}

	// Insert task with generated _id
	const newId = await ctx.db.insert("tasks", {
		userAuthId: createDetail.userAuthId,
		type: "task",
		title: createDetail.title,
		content: createDetail.content,
		status: createDetail.status ?? 0,
		todaysTask: createDetail.todaysTask,
		dueDate: createDetail.dueDate,
		parents: finalParents,
		children: createDetail.children ?? [],
		lastEdit: now,
		created: createDetail.created ?? now,
	});

	// Update root.children if attached to root
	const rootTask = await getOrCreateRoot(ctx, createDetail.userAuthId);
	if (finalParents.length === 1 && finalParents[0] === rootTask._id) {
		const rootChildren = [...(rootTask.children ?? [])];
		if (!rootChildren.includes(String(newId))) {
			rootChildren.push(String(newId));
			await ctx.db.patch(rootTask._id, {
				children: rootChildren,
				lastEdit: now,
			});
		}
	}

	// Get created task
	const createdTask = await ctx.db.get(newId);
	if (!createdTask) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created task", ctx: newId });

	// Propagate relationship changes
	const affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: null, newTask: createdTask }
	]);

	return {
		created: { ...cleanTaskForClient(createdTask), givenId: createDetail.id },
		affected: affected.map(cleanTaskForClient)
	};
}


export const updateTask = mutation({
	args: argsUpdateTask,
	handler: async (ctx, update) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}

		return await _updateTask(ctx, update as UpdateTaskParams<number>);
	},
});

export const updateTasks = mutation({
	args: { updates: v.array(argsUpdateTask) },
	handler: async (ctx, { updates }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const updated: ClientTask[] = [];
		let affected: ClientTask[] = [];
		for (const update of updates) {
			const { updated: updatedTask, affected: affectedTasks } = await _updateTask(ctx, update as UpdateTaskParams<number>);
			updated.push(updatedTask);
			affected.push(...affectedTasks);
		}

		// Dedup affected
		affected = affected.filter((t, index, self) => self.findIndex(t2 => t2.id === t.id) === index);

		return { updated, affected };
	},
});

async function _updateTask(ctx: MutationCtx, update: UpdateTaskParams<number>): Promise<{ updated: ClientTask, affected: ClientTask[] }> {
	const taskId = update.id as Id<"tasks">;

	// Get old task state
	const oldTask = await ctx.db.get(taskId);
	if (!oldTask) throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: update.id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== oldTask.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of task", ctx: update.id });
	}

	// Enforce root constraints
	if (oldTask.type === "root" && (update.data.parents || update.data.addParents || update.data.removeParents)) {
		throw new ConvexError({ type: "InvalidState", msg: "Root task cannot have parents modified", ctx: update.id });
	}

	const now = Date.now();

	// Resolve relations operations into arrays
	// Initialize with static set. If no update is provided, 
	// use the old task's relations and prepare for deltas
	let parents = [...(update.data.parents ?? oldTask.parents ?? [])];
	let children = [...(update.data.children ?? oldTask.children ?? [])];

	if (update.data.addParents) {
		parents = [...parents, ...update.data.addParents];
	}

	if (update.data.removeParents) {
		parents = parents.filter(id => !update.data.removeParents!.includes(id));
	}

	if (update.data.addChildren) {
		children = [...children, ...update.data.addChildren];
	}

	if (update.data.removeChildren) {
		children = children.filter(id => !update.data.removeChildren!.includes(id));
	}


	// Normalize parents (non-root only)
	if (oldTask.type !== "root") {
		if (parents.length === 0) {
			const rootTask = await getOrCreateRoot(ctx, oldTask.userAuthId);
			parents = [String(rootTask._id)];
		} else if (parents.length > 1) {
			const rootTask = await getOrCreateRoot(ctx, oldTask.userAuthId);
			const rootId = String(rootTask._id);
			if (parents.includes(rootId)) {
				parents = parents.filter(id => id !== rootId);
			}
		}
	}

	// Reassign delta fields for update
	update.data.parents = parents;
	update.data.children = children;
	update.data.lastEdit = update.data.lastEdit ?? now;

	// Strip delta fields that aren't on our object
	delete update.data.addParents;
	delete update.data.removeParents;
	delete update.data.addChildren;
	delete update.data.removeChildren;

	// Apply patch
	await ctx.db.patch(taskId, update.data);

	// Handle root attachment/detachment
	if (oldTask.type !== "root") {
		const rootTask = await getOrCreateRoot(ctx, oldTask.userAuthId);
		const rootId = String(rootTask._id);
		const wasAttachedToRoot = oldTask.parents?.includes(rootId);
		const isAttachedToRoot = parents.includes(rootId);

		if (!wasAttachedToRoot && isAttachedToRoot) {

			// Newly attached to root
			const rootChildren = [...(rootTask.children ?? [])];
			if (!rootChildren.includes(String(taskId))) {
				rootChildren.push(String(taskId));
				await ctx.db.patch(rootTask._id, {
					children: rootChildren,
					lastEdit: now,
				});
			}
		} else if (wasAttachedToRoot && !isAttachedToRoot) {

			// Detached from root
			const rootChildren = (rootTask.children ?? []).filter(id => id !== String(taskId));
			await ctx.db.patch(rootTask._id, {
				children: rootChildren,
				lastEdit: now,
			});
		}
	}

	// Get updated task
	const updated = await ctx.db.get(taskId);
	if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated task", ctx: taskId });

	// Propagate relationship changes
	let affected = await propagateRelationshipChanges(ctx, [
		{ oldTask, newTask: updated }
	]);

	return {
		updated: cleanTaskForClient(updated),
		affected: affected.map(cleanTaskForClient)
	};
}


export const deleteTask = mutation({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		return await _deleteTask(ctx, id as Id<"tasks">);
	},
});

export const deleteTasks = mutation({
	args: { ids: v.array(v.string()) },
	handler: async (ctx, { ids }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}

		let affected: ClientTask[] = [];
		for (const id of ids) {
			const { affected: affectedTasks } = await _deleteTask(ctx, id as Id<"tasks">);
			affected.push(...affectedTasks);
		}

		// Dedup affected
		affected = affected.filter((t, index, self) => self.findIndex(t2 => t2.id === t.id) === index);
		return { affected };
	},
});

async function _deleteTask(ctx: MutationCtx, id: Id<"tasks">): Promise<{ affected: ClientTask[] }> {
	// Get task
	const task = await ctx.db.get(id);
	if (!task) throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== task.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of task", ctx: String(id) });
	}

	// Prevent root deletion
	if (task.type === "root") {
		throw new ConvexError({ type: "InvalidState", msg: "Root task cannot be deleted", ctx: String(id) });
	}

	// Propagate relationship changes before deletion
	let affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: task, newTask: null }
	]);

	// Attach orphaned tasks (those with no parents) to root
	const orphanedTasks: DBTask[] = affected.filter(t => t.type !== "root" && (t.parents?.length ?? 0) === 0);
	if (orphanedTasks.length > 0) {
		const rootTask = await getOrCreateRoot(ctx, task.userAuthId);
		const rootId = String(rootTask._id);

		// Propagate attachment of orphans to root
		const now = Date.now();
		const orphanChanges = orphanedTasks.map(orphan => {
			// Create updated version with root as parent
			const updatedOrphan = {
				...orphan,
				parents: [rootId],
				lastEdit: now,
			};
			return { oldTask: orphan, newTask: updatedOrphan };
		});
		orphanChanges.forEach(change => {
			ctx.db.patch(change.oldTask._id, change.newTask);
		});

		// Propagate these changes (this will automatically update root's children)
		const orphanAffected = await propagateRelationshipChanges(ctx, orphanChanges);

		// Merge affected tasks, deduplicating
		const affectedMap = new Map<string, DBTask>();
		for (const t of affected) {
			affectedMap.set(String(t._id), t);
		}
		for (const t of orphanAffected) {
			affectedMap.set(String(t._id), t);
		}
		for (const t of orphanChanges) {
			affectedMap.set(String(t.newTask._id), t.newTask);
		}

		affected = Array.from(affectedMap.values());
	}

	// Delete task
	await ctx.db.delete(id);

	return { affected: affected.map(cleanTaskForClient) };
}


//#endregion


//#region Observers

export const getTask = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const row = await ctx.db.get(id as Id<"tasks">);
		if (!row) {
			throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: id });
		}
		return cleanTaskForClient(row);
	},
});

export const getTasks = query({
	args: { ids: v.array(v.string()) },
	handler: async (ctx, { ids }) => {
		const rows = await Promise.all(ids.map((i) => ctx.db.get(i as Id<"tasks">)));
		const found = rows.filter(Boolean) as Doc<"tasks">[];
		if (found.length !== ids.length) {
			throw new ConvexError({ type: "NotFoundError", msg: "Some tasks not found", ctx: ids.map((x) => x).join(",") });
		}
		return found.map(cleanTaskForClient);
	},
});

export const getAllUserTasks = query({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_user", (q) => q.eq("userAuthId", userId))
			.collect();
		// Filter out root tasks - they're hidden from clients
		const tasks = rows.filter(t => t.type === "task");
		return tasks.map(cleanTaskForClient);
	},
});

export const getChildrenOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const parent = await ctx.db.get(id as Id<"tasks">);
		if (!parent) throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: id });
		const childIds = parent.children ?? [];
		if (childIds.length === 0) return [];

		// Fetch only the children we need, preserving order
		const childDocs = await Promise.all(childIds.map((cid) => ctx.db.get(cid as Id<"tasks">)));
		const ordered = childDocs.filter(
			(t): t is NonNullable<typeof t> => !!t
		);
		return ordered.map(cleanTaskForClient);
	},
});

export const getParentsOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const child = await ctx.db.get(id as Id<"tasks">);
		if (!child) throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: id });
		const parentIds = child.parents ?? [];
		if (parentIds.length === 0) return [];
		const parentDocs = await Promise.all(parentIds.map((pid) => ctx.db.get(pid as Id<"tasks">)));
		const filtered = parentDocs.filter((t): t is NonNullable<typeof t> => !!t);
		return filtered.map(cleanTaskForClient);
	},
});

export const getSiblingsOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		// 0) Load the task
		const self = await ctx.db.get(id as Id<"tasks">);
		if (!self) {
			throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: id });
		}

		// Utility: stable sort siblings according to parent.children order
		function sortSiblingsByParentChildren<T extends { _id: unknown }>(
			parent: Doc<"tasks">,
			siblings: T[]
		): T[] {
			const childIds = Array.isArray(parent.children) ? parent.children : [];
			if (childIds.length === 0) return siblings.slice();

			// Build index map for O(1) position lookup
			const pos = new Map<Id<"tasks">, number>();
			for (let i = 0; i < childIds.length; i++) {
				pos.set(childIds[i] as Id<"tasks">, i);
			}

			return siblings
				.map((t, idx) => {
					const taskId = (t as any)._id as Id<"tasks">;
					const order = pos.has(taskId) ? pos.get(taskId)! : Infinity;
					return { t, order, idx };
				})
				.sort((a, b) => (a.order === b.order ? a.idx - b.idx : a.order - b.order))
				.map((x) => x.t);
		}

		// Pre-processing data
		const seen = new Map<Id<"tasks">, Doc<"tasks"> | null>();
		const siblings = new Map<Doc<"tasks">, Doc<"tasks">[]>();
		const addSibling = (parent: Doc<"tasks">, sibling: Doc<"tasks">) => {
			const arr = siblings.get(parent);
			if (arr) arr.push(sibling);
			else siblings.set(parent, [sibling]);
		};

		// 2-a) Handle root tasks
		let parentIds = self.parents ?? [];
		if (parentIds.length === 0) {
			const root = await getOrCreateRoot(ctx, self.userAuthId);
			parentIds = [root._id];
		}

		// 2-b) Fetch only the parents we need
		const parentFetches = parentIds.map((pid) =>
			ctx.db.get(pid as Id<"tasks">)
		);
		const parents = await Promise.all(parentFetches);
		const existingParents = parents.filter(
			(p): p is NonNullable<typeof p> => !!p
		);

		if (existingParents.length === 0) {
			throw new ConvexError({ type: "NotFoundError", msg: "Task parents not found for sibling calculation", ctx: id });
		}

		// 3) Compute de-duplicated sibling ids from parents' children arrays
		for (const parent of existingParents) {
			const childIds = parent.children ?? [];
			if (!Array.isArray(childIds) || childIds.length === 0) {
				// Even if parent has no children array, still include self as the only "sibling" if not root
				if (self.type !== "root") addSibling(parent, self);
				continue;
			}

			for (const cid of childIds as Array<Id<"tasks">>) {
				if (cid === self._id || cid === parent._id) continue; // exclude self and parent
				if (seen.has(cid)) {
					const cached = seen.get(cid)!;
					if (cached) addSibling(parent, cached);
					continue;
				}
				const sibling = await ctx.db.get(cid);
				seen.set(cid, sibling);
				if (sibling) addSibling(parent, sibling);
			}

			// Include self in each parent's group (unless root)
			if (self.type !== "root") addSibling(parent, self);
		}

		// 4) Sort each siblings array to match parent.children order (stable, unknowns last)
		const sortedEntries: Array<[Doc<"tasks">, Doc<"tasks">[]]> = [];
		for (const [parent, group] of siblings) {
			const sorted = sortSiblingsByParentChildren(parent, group);
			sortedEntries.push([parent, sorted]);
		}

		return sortedEntries.map(([parent, siblings]) => [cleanTaskForClient(parent), siblings.map(cleanTaskForClient)]) as [ClientTask, ClientTask[]][];
	},
});

export const getRootTasks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return []; // TODO:UX/DX Log and error

		// Get root task for user
		const root = await getOrCreateRoot(ctx, identity.subject);

		// Return root's children (parentless tasks)
		const childIds = root.children ?? [];
		if (childIds.length === 0) return [];

		const childDocs = await Promise.all(childIds.map((cid) => ctx.db.get(cid as Id<"tasks">)));

		return childDocs.filter((t): t is NonNullable<typeof t> => !!t).map(cleanTaskForClient);
	},
});

export const getTodaysTasks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];
		const now = new Date();
		const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
		const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0);
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_todays_task", (q) => q.eq("userAuthId", identity.subject).gte("todaysTask", start).lt("todaysTask", next))
			.collect();
		return rows.map(cleanTaskForClient);
	},
});

export const getPrioritizedTasks = query({
	args: { limit: v.number() },
	handler: async (ctx, { limit }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError({ type: "NotAuthorizedError", msg: "Auth Identity not found" });

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_user", (q) => q.eq("userAuthId", identity.subject))
			.collect();

		// Filter out root tasks - they're hidden from clients
		const taskTasks = tasks.filter(t => t.type !== "root");
		// Get root to start traversal from root's children
		const root = await getOrCreateRoot(ctx, identity.subject);
		const tasksMap = new Map(taskTasks.map((t) => [t._id, t] as [string, DBTask]));
		const sorter = (a?: DBTask, b?: DBTask) => {
			// TODO This is going to need context from the parent to determine sibling priority...
			if (!a) return -1; if (!b) return 1; return 0; // (b.priority ?? 0) - (a.priority ?? 0);
		};
		const todo: DBTask[] = [];
		const seen = new Set<string>();
		const walk = (task: DBTask) => {
			if (todo.length === limit) return;
			if (task.children.length === 0) {
				if (seen.has(task._id)) return;
				seen.add(task._id);
				if (task.status === 0) todo.push(task);
			} else {
				const children = task.children.map((id) => tasksMap.get(id)).sort(sorter);
				for (const c of children) { if (c && c.status === 0) walk(c); }

				/* TODO:discuss This allows "tasks" that may be used for grouping
				to show up in the planner's suggestions. This should probably have
				some form of configuration, because it's awkward having to manually
				"complete" a task that isn't really a task at all.
				This will likely play into the node-type system if we ever get there...
				*/
				if (children.every((c) => !c || c.status !== 0) && task.status === 0) todo.push(task);
			}
		};
		// Start from root's children (parentless tasks)
		const rootChildren = (root.children ?? []).map(id => tasksMap.get(id)).filter((t): t is DBTask => !!t).sort(sorter);
		for (const r of rootChildren) { if (todo.length === limit) break; walk(r); }
		return todo.map(cleanTaskForClient);
	},
});

export const searchTasks = query({
	args: { searchTerm: v.string() },
	handler: async (_ctx, _args) => {
		throw new ConvexError({ type: "NotImplementedError", msg: "Convex.tasks.searchTasks" });
	},
});

//#endregion


//#region Utilities

/**
 * Gets or creates the root task for a user. Ensures exactly one root per user.
 * Root tasks are hidden from clients and serve as the parent for all parentless tasks.
 */
export async function getOrCreateRoot(ctx: any, userAuthId: string): Promise<DBTask> {
	// Look for existing root
	const existingRoots = await ctx.db
		.query("tasks")
		.withIndex("by_user_type", (q: any) => q.eq("userAuthId", userAuthId).eq("type", "root"))
		.collect();

	if (existingRoots.length === 1) {
		return existingRoots[0];
	} else if (existingRoots.length > 1) {
		// TODO: Consider cleanup migration if multiple roots found
		throw new ConvexError({ type: "NotImplementedError", msg: "Multiple root tasks found for user" });
	} else {
		// Create root task
		const now = Date.now();
		const rootId = await ctx.db.insert("tasks", {
			userAuthId,
			type: "root",
			title: "", // Empty title - root is hidden from clients
			status: 0, // incomplete
			parents: [], // Root has no parents
			children: [], // Will be populated as parentless tasks are attached
			lastEdit: now,
			created: now,
		});

		const root = await ctx.db.get(rootId);
		if (!root) {
			throw new ConvexError({ type: "Error", msg: "Failed to create root task" });
		}
		return root;
	}
}

async function propagateRelationshipChanges(
	ctx: MutationCtx,
	changes: Array<{ oldTask: DBTask | null; newTask: DBTask | null }>
): Promise<DBTask[]> {
	// Convert to ITask format
	const taskChanges = changes.map(({ oldTask, newTask }) => ({
		oldTask: oldTask ? cleanTaskForClient(oldTask) : null,
		newTask: newTask ? cleanTaskForClient(newTask) : null,
	}));

	// Calculate relationship updates using shared logic
	const updates = calculateRelationshipUpdates<number>(taskChanges);

	const affectedTasks: DBTask[] = [];
	const now = Date.now();

	// Apply each update
	for (const { taskId, operations } of updates) {
		const relatedTask = await ctx.db.get(taskId as Id<"tasks">);
		if (!relatedTask) throw new ConvexError({ type: "NotFoundError", msg: "Task not found", ctx: taskId });

		// Apply operations using shared logic
		const updated = applyRelationshipOperations(cleanTaskForClient(relatedTask), operations);

		// Patch the DB
		await ctx.db.patch(relatedTask._id, {
			parents: updated.parents,
			children: updated.children,
		});

		const refreshed = await ctx.db.get(relatedTask._id);
		if (refreshed) affectedTasks.push(refreshed);
	}

	// Deduplicate
	const seen = new Set<string>();
	return affectedTasks.filter(t => {
		const key = String(t._id);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function cleanTaskForClient(task: DBTask): ClientTask {
	const t: ITask<number> = {
		id: task._id,
		userAuthId: task.userAuthId,
		type: task.type!,
		title: task.title,
		content: task.content,
		status: task.status,
		parents: task.parents,
		children: task.children,
		todaysTask: task.todaysTask,
		dueDate: task.dueDate,
		created: task.created ?? task._creationTime,
		lastEdit: task.lastEdit
	};

	return t;
}

//#endregion