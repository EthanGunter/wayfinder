import { Err, NotAuthorizedError, NotFoundError, NotImplementedError } from "$domain/errors";
import { type Doc, type Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { calculateRelationshipChanges, relationshipChangesToUpdateParams, type SystemAgnosticTask } from "$domain/models/task";


//#region Utility

type DBTask = Doc<'tasks'>;
type TaskWithId = Omit<DBTask, "_creationTime">;
const argsCreateTask = v.object({
	id: v.optional(v.string()),
	userAuthId: v.string(),
	title: v.string(),
	content: v.optional(v.string()),
	status: v.optional(v.number()),
	todaysTask: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	created: v.optional(v.number()),
	parents: v.optional(v.array(v.string())),
	children: v.optional(v.array(v.string())),
	lastEdit: v.optional(v.number()),
})

//#endregion


//#region Convex API (queries & mutations)

export const createTask = mutation({
	args: {
		createDetail: argsCreateTask,
	},
	handler: async (ctx, { createDetail }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return {
				ok: false as const,
				error: serializeError(new NotAuthorizedError("Not authenticated")),
			};
		}
		if (createDetail.userAuthId !== identity.subject) {
			return {
				ok: false as const,
				error: serializeError(
					new NotAuthorizedError("Invalid user context", createDetail.userAuthId)
				),
			};
		}

		const now = Date.now();

		// Legacy external id hint (we don’t use it as _id; we only map it)
		const raw = { ...createDetail };
		const oldId = raw.id ? String(raw.id) : null;
		delete (raw as any).id;

		// Insert with Convex-generated _id, using same defaults as createTasks
		const newGeneratedId = await ctx.db.insert("tasks", {
			...raw,
			status: raw.status ?? 0,
			parents: raw.parents ?? [],
			children: raw.children ?? [],
			lastEdit: now,
			created: raw.created ?? now,
		});

		// Local constructed task (avoid extra get)
		const inserted: TaskWithId = {
			_id: newGeneratedId as Id<"tasks">,
			status: raw.status ?? 0,
			userAuthId: raw.userAuthId,
			title: raw.title,
			content: raw.content,
			todaysTask: raw.todaysTask,
			dueDate: raw.dueDate,
			parents: raw.parents ?? [],
			children: raw.children ?? [],
			lastEdit: now,
			created: raw.created ?? now,
		};

		// Legacy id -> new id mapping (match createTasks semantics)
		const updatedIds: [string, string][] = [];
		const idMap = new Map<string, string>();
		if (oldId) {
			idMap.set(oldId, String(newGeneratedId));
			updatedIds.push([oldId, String(newGeneratedId)]);
		}

		// If a legacy id was provided and referenced within this task’s own relations,
		// remap those references locally and defer a patch (same pattern as createTasks)
		const deferredPatches: Array<{ id: Id<"tasks">; patch: Partial<DBTask> }> =
			[];

		if (idMap.size > 0) {
			const remapArray = (
				arr: (string | Id<"tasks">)[] | undefined
			): { out: (string | Id<"tasks">)[]; changed: boolean } => {
				if (!arr || arr.length === 0)
					return { out: [] as (string | Id<"tasks">)[], changed: false };
				let changed = false;
				const out = arr.map((x) => {
					const k = String(x);
					const m = idMap.get(k);
					if (m) {
						changed = true;
						return m as Id<"tasks">;
					}
					return x;
				});
				return { out: changed ? out : arr, changed };
			};

			const { out: newParents, changed: pChanged } = remapArray(inserted.parents);
			const { out: newChildren, changed: cChanged } = remapArray(
				inserted.children
			);
			if (pChanged || cChanged) {
				inserted.parents = newParents;
				inserted.children = newChildren;
				deferredPatches.push({
					id: inserted._id,
					patch: {
						parents: newParents,
						children: newChildren,
						lastEdit: now,
					},
				});
			}

			// Targeted neighbor updates (swap old->new in neighbors),
			// mirroring createTasks even though this is a single insert.
			const swapInArray = (
				arr: (string | Id<"tasks">)[],
				oldIdS: string,
				newIdS: string
			) => {
				let changed = false;
				const out: (string | Id<"tasks">)[] = [];
				for (const x of arr) {
					if (String(x) === oldIdS) {
						out.push(newIdS as unknown as Id<"tasks">);
						changed = true;
					} else {
						out.push(x);
					}
				}
				// Dedup
				const seen = new Set<string>();
				const dedup: (string | Id<"tasks">)[] = [];
				for (const x of out) {
					const k = String(x);
					if (!seen.has(k)) {
						seen.add(k);
						dedup.push(x);
					} else {
						changed = true;
					}
				}
				return { arr: dedup, changed };
			};

			// With single insert, we only have the single mapping (if any)
			for (const [oId, nId] of idMap.entries()) {
				// Update each parent: swap child old->new in parent's children[]
				for (const parentId of inserted.parents ?? []) {
					const pId = parentId as Id<"tasks">;
					const parentDoc = (await ctx.db.get(pId)) ?? undefined;
					if (!parentDoc) continue;
					const children = Array.isArray(parentDoc.children)
						? parentDoc.children
						: [];
					const { arr: newChildren, changed } = swapInArray(children, oId, nId);
					if (changed) {
						deferredPatches.push({
							id: parentDoc._id,
							patch: { children: newChildren, lastEdit: now },
						});
					}
				}

				// Update each child: swap parent old->new in child's parents[]
				for (const childId of inserted.children ?? []) {
					const cId = childId as Id<"tasks">;
					const childDoc = (await ctx.db.get(cId)) ?? undefined;
					if (!childDoc) continue;
					const parents = Array.isArray(childDoc.parents)
						? childDoc.parents
						: [];
					const { arr: newParents, changed } = swapInArray(parents, oId, nId);
					if (changed) {
						deferredPatches.push({
							id: childDoc._id,
							patch: { parents: newParents, lastEdit: now },
						});
					}
				}
			}
		}

		// Apply deferred patches (coalesce by id), then sync local copy
		if (deferredPatches.length > 0) {
			const byId = new Map<string, Partial<DBTask>>();
			for (const { id, patch } of deferredPatches) {
				const k = String(id);
				const existing = byId.get(k) ?? {};
				Object.assign(existing, patch);
				byId.set(k, existing);
			}
			for (const [idStr, patch] of byId.entries()) {
				await ctx.db.patch(idStr as unknown as Id<"tasks">, patch);
			}
			// sync local inserted with any self-patch
			const mergedSelf = { ...inserted, ...(byId.get(String(inserted._id)) ?? {}) };
			Object.assign(inserted, mergedSelf);
		}

		// Relationship updates identical to createTasks
		const relationshipUpdates = calculateRelationshipChanges<number>([
			{
				oldTask: null,
				newTask: convertToTaskBase(inserted as DBTask),
			},
		]);
		const updateParams = relationshipChangesToUpdateParams(relationshipUpdates);

		const affectedTasks: DBTask[] = [inserted as unknown as DBTask];

		for (const update of updateParams) {
			const relatedTaskId = update.id as Id<"tasks">;
			const result = await applyTaskUpdate(ctx, {
				id: relatedTaskId,
				relations: update.relations,
			});
			if (result.ok) {
				affectedTasks.push(result.value);
			}
		}

		return {
			ok: true as const,
			value: {
				// preserve single-create contract while mirroring batch returns
				oldId: oldId ?? "",
				newId: String(newGeneratedId),
				updatedIds,
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
			return {
				ok: false as const,
				error: serializeError(new NotAuthorizedError("Not authenticated")),
			};
		}
		for (const d of createDetails) {
			if (d.userAuthId !== identity.subject) {
				return {
					ok: false as const,
					error: serializeError(
						new NotAuthorizedError("Invalid user context for batch")
					),
				};
			}
		}

		const now = Date.now();

		// Outputs
		const insertedTasks: TaskWithId[] = [];
		const updatedIds: [string, string][] = [];

		// We always let Convex generate _id; provided `id` is only a legacy hint.
		const idMap = new Map<string, string>();

		// Collect neighbor patches to apply in one pass
		const deferredPatches: Array<{
			id: Id<"tasks">;
			patch: Partial<DBTask>;
		}> = [];

		// Keep a lookup of freshly inserted tasks
		const insertedById = new Map<string, TaskWithId>();

		// Insert all tasks; build mapping and local copies
		for (const raw of createDetails) {
			const d = { ...raw };
			const oldId = d.id ? String(d.id) : null;
			delete (d as any).id;

			const newGeneratedId = await ctx.db.insert("tasks", {
				...d,
				status: d.status ?? 0,
				parents: d.parents ?? [],
				children: d.children ?? [],
				lastEdit: now,
				created: d.created ?? now,
			});

			// Build the inserted row locally (avoid get())
			const row: TaskWithId = {
				_id: newGeneratedId as Id<"tasks">,
				status: d.status ?? 0,
				userAuthId: d.userAuthId,
				title: d.title,
				content: d.content,
				todaysTask: d.todaysTask,
				dueDate: d.dueDate,
				parents: d.parents ?? [],
				children: d.children ?? [],
				lastEdit: now,
				created: d.created ?? now,
			};

			insertedTasks.push(row);
			insertedById.set(String(newGeneratedId), row);

			if (oldId) {
				// Populate both the internal map and the returned updatedIds
				idMap.set(oldId, String(newGeneratedId));
				updatedIds.push([oldId, String(newGeneratedId)]);
			}
		}

		// If any id remaps exist, update references:
		// - inside newly inserted tasks
		// - on the immediate neighbors (parents/children) listed on those tasks
		if (idMap.size > 0) {
			const remapArray = (arr: (string | Id<"tasks">)[] | undefined) => {
				if (!arr || arr.length === 0) return { out: [] as (string | Id<"tasks">)[], changed: false };
				let changed = false;
				const out = arr.map((x) => {
					const k = String(x);
					const m = idMap.get(k);
					if (m) {
						changed = true;
						return m as Id<"tasks">;
					}
					return x;
				});
				return { out: changed ? out : arr, changed };
			};

			// 1) Remap references inside the newly inserted tasks (local, defer patch)
			for (const t of insertedTasks) {
				const { out: newParents, changed: pChanged } = remapArray(t.parents);
				const { out: newChildren, changed: cChanged } = remapArray(t.children);
				if (pChanged || cChanged) {
					t.parents = newParents;
					t.children = newChildren;
					deferredPatches.push({
						id: t._id,
						patch: {
							parents: newParents,
							children: newChildren,
							lastEdit: now,
						},
					});
				}
			}

			// 2) Targeted neighbor updates
			const swapInArray = (
				arr: (string | Id<"tasks">)[],
				oldId: string,
				newId: string
			) => {
				let changed = false;
				const out: (string | Id<"tasks">)[] = [];
				for (const x of arr) {
					if (String(x) === oldId) {
						out.push(newId as unknown as Id<"tasks">);
						changed = true;
					} else {
						out.push(x);
					}
				}
				// Dedup
				const seen = new Set<string>();
				const dedup: (string | Id<"tasks">)[] = [];
				for (const x of out) {
					const k = String(x);
					if (!seen.has(k)) {
						seen.add(k);
						dedup.push(x);
					} else {
						changed = true;
					}
				}
				return { arr: dedup, changed };
			};

			for (const [oldId, newId] of idMap.entries()) {
				const newTask = insertedById.get(newId);
				if (!newTask) continue;

				// Update each parent: swap old child id -> new child id in parent's children[]
				for (const parentId of newTask.parents ?? []) {
					const pId = parentId as Id<"tasks">;
					let parentDoc = insertedById.get(String(pId));
					if (!parentDoc) parentDoc = (await ctx.db.get(pId)) ?? undefined;
					if (!parentDoc) continue;

					const children = Array.isArray(parentDoc.children)
						? parentDoc.children
						: [];
					const { arr: newChildren, changed } = swapInArray(
						children,
						oldId,
						newId
					);
					if (changed) {
						if (insertedById.has(String(parentDoc._id))) {
							parentDoc.children = newChildren;
						}
						deferredPatches.push({
							id: parentDoc._id,
							patch: { children: newChildren, lastEdit: now },
						});
					}
				}

				// Update each child: swap old parent id -> new parent id in child's parents[]
				for (const childId of newTask.children ?? []) {
					const cId = childId as Id<"tasks">;
					let childDoc = insertedById.get(String(cId));
					if (!childDoc) childDoc = (await ctx.db.get(cId)) ?? undefined;
					if (!childDoc) continue;

					const parents = Array.isArray(childDoc.parents)
						? childDoc.parents
						: [];
					const { arr: newParents, changed } = swapInArray(
						parents,
						oldId,
						newId
					);
					if (changed) {
						if (insertedById.has(String(childDoc._id))) {
							childDoc.parents = newParents;
						}
						deferredPatches.push({
							id: childDoc._id,
							patch: { parents: newParents, lastEdit: now },
						});
					}
				}
			}
		}

		// Apply all deferred patches in a single pass (coalesce by id)
		if (deferredPatches.length > 0) {
			const byId = new Map<string, Partial<DBTask>>();
			for (const { id, patch } of deferredPatches) {
				const k = String(id);
				const existing = byId.get(k) ?? {};
				Object.assign(existing, patch);
				byId.set(k, existing);
			}
			for (const [idStr, patch] of byId.entries()) {
				await ctx.db.patch(idStr as unknown as Id<"tasks">, patch);
			}
			// sync local copies used for relationship calc
			for (let i = 0; i < insertedTasks.length; i++) {
				const t = insertedTasks[i];
				const merged = { ...t, ...(byId.get(String(t._id)) ?? {}) };
				insertedTasks[i] = merged as DBTask;
			}
		}

		// Relationship updates for newly created tasks
		const relationshipUpdates = calculateRelationshipChanges<number>(
			insertedTasks.map((task) => ({
				oldTask: null,
				newTask: convertToTaskBase(task as DBTask),
			}))
		);
		const updateParams = relationshipChangesToUpdateParams(relationshipUpdates);
		const affectedTasks = [...insertedTasks];

		for (const update of updateParams) {
			const relatedTaskId = update.id as Id<"tasks">;
			const result = await applyTaskUpdate(ctx, {
				id: relatedTaskId,
				relations: update.relations,
			});
			if (result.ok) {
				affectedTasks.push(result.value);
			}
		}

		return {
			ok: true as const,
			value: {
				updatedIds,
				affectedTasks: affectedTasks as DBTask[],
			},
		};
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

		// Fetch only the children we need, preserving order
		const childDocs = await Promise.all(childIds.map((cid) => ctx.db.get(cid as Id<"tasks">)));
		const ordered = childDocs.filter(
			(t): t is NonNullable<typeof t> => !!t
		);
		return { ok: true as const, value: ordered };
	},
});

export const getParentsOf = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		const child = await ctx.db.get(id);
		if (!child) return { ok: false as const, error: serializeError(new NotFoundError("Task not found", "" + id)) };
		const parentIds = child.parents ?? [];
		if (parentIds.length === 0) return { ok: true as const, value: [] };
		const parentDocs = await Promise.all(parentIds.map((pid) => ctx.db.get(pid as Id<"tasks">)));
		const filtered = parentDocs.filter((t): t is NonNullable<typeof t> => !!t);
		return { ok: true as const, value: filtered };
	},
});

export const getSiblingsOf = query({
	args: { id: v.id("tasks") },
	handler: async (ctx, { id }) => {
		// 1) Load the task
		const self = await ctx.db.get(id);
		if (!self) {
			return {
				ok: false as const,
				error: serializeError(new NotFoundError("Task not found", "" + id)),
			};
		}

		const parentIds = self.parents ?? [];
		if (parentIds.length === 0) {
			return { ok: true as const, value: [] };
		}

		// 2) Fetch only the parents we need
		const parentFetches = parentIds.map((pid) => ctx.db.get(pid as Id<"tasks">));
		const parents = await Promise.all(parentFetches);
		const existingParents = parents.filter(
			(p): p is NonNullable<typeof p> => !!p
		);

		if (existingParents.length === 0) {
			// Parents list references missing docs -> no siblings we can resolve
			return { ok: true as const, value: [] };
		}

		// 3) Compute de-duplicated sibling ids from parents' children arrays
		const selfKey = "" + id;
		const seen = new Map<string, Doc<'tasks'> | null>();
		const siblings = new Map<Doc<'tasks'>, Doc<'tasks'>[]>();

		const addSibling = (parent: Doc<'tasks'>, sibling: Doc<'tasks'>) => {
			if (siblings.has(parent)) {
				siblings.get(parent)!.push(sibling);
			} else {
				siblings.set(parent, [sibling]);
			}
		}

		for (const parent of existingParents) {
			const childIds = parent.children ?? [];
			if (!Array.isArray(childIds) || childIds.length === 0) continue;

			for (const cid of childIds as Array<string | { _id?: unknown }>) {
				const key = "" + cid; // convex ids stringify fine
				if (key === selfKey) continue; // exclude self
				if (seen.has(key)) {
					addSibling(parent, seen.get(key)!);
					continue; // dedupe across parents
				}
				const sibling = await ctx.db.get(key as Id<'tasks'>);
				seen.set(key, sibling);
				if (sibling) addSibling(parent, sibling);
			}
		}

		return { ok: true as const, value: Array.from(siblings) };
	},
});

export const getRootTasks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { ok: true as const, value: [] }; // TODO:UX/DX Log and error
		const rows = await ctx.db
			.query("tasks")
			.withIndex("by_user", (q) => q.eq("userAuthId", identity.subject))
			.collect();
		const roots = rows.filter((t) => (t.parents?.length ?? 0) === 0);
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
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { ok: true as const, value: [] }; // TODO:UX/DX Log and error
		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_user", (q) => q.eq("userAuthId", identity.subject))
			.collect();
		const roots = tasks.filter((t) => (t.parents?.length ?? 0) === 0);
		const tasksMap = new Map(tasks.map((t) => ["" + t._id, t] as [string, DBTask]));
		const sorter = (a?: DBTask, b?: DBTask) => {
			// TODO This is going to need context from the parent to determine sibling priority...
			if (!a) return -1; if (!b) return 1; return 0; // (b.priority ?? 0) - (a.priority ?? 0);
		};
		const todo: DBTask[] = [];
		const seen = new Set<string>();
		const walk = (task: DBTask) => {
			if (todo.length === limit) return;
			if (task.children.length === 0) {
				if (seen.has("" + task._id)) return;
				seen.add("" + task._id);
				if (task.status === 0) todo.push(task);
			} else {
				const children = task.children.map((id) => tasksMap.get(id)).sort(sorter);
				for (const c of children) { if (c && c.status === 0) walk(c); }

				/* TODO:discuss This allows "tasks" that may be used for grouping
				to show up in the planner's suggestions. This should probably have
				some form of configuration, because it's awkward having to manually
				"complete" a task that isn't really a task at all.
				This will likely play into the node-type system if we every get there...
				*/
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
	const t = {
		...task,
		id: task._id,
		created: task._creationTime,
	};

	delete (t as Partial<DBTask>)._id;
	delete (t as Partial<DBTask>)._creationTime;
	return t;
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
	// Allow stable reordering of children without emitting relation add/remove churn
	// Only accept explicit children arrays (membership-preserving reorder is expected here)
	if (Array.isArray(d.children)) {
		patch.children = d.children!;
	}
	if ((update.relations ?? []).length > 0) { patch.parents = parents; patch.children = children; }

	await ctx.db.patch(update.id, patch);
	const refreshed = await ctx.db.get(update.id);
	return { ok: true as const, value: refreshed };
}

//#endregion