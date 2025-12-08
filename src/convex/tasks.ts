import { ArgumentError, InvalidStateError } from "$domain/errors";
import type { Doc, Id } from "./_generated/dataModel";
import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { applyRelationshipOperations, calculateRelationshipUpdates, EXPORT_VERSIONS, TaskStatus } from "$domain/models/task";
import type { CreateTaskParams, ExportedData, TaskData, UpdateTaskParams } from "$domain/models/task";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { AppData as AppData, IAppNode } from "$domain/models/node";
import type { ProjectData } from "$domain/models/project";

// TODO:refactor Replace all errors with ConvexError<TaskServerErr>

//#region Types

type DBNode = Doc<'nodes'>;
type ClientNode<T extends AppData<number> = AppData<number>> = IAppNode<T, number>;
type ClientTaskData = TaskData<number>;
type ClientTaskNode = IAppNode<ClientTaskData, number>;
type CreateTaskArgs = CreateTaskParams<number> & { id?: string };

const argsCreateTask = v.object({
	id: v.optional(v.string()),
	title: v.string(),
	userAuthId: v.optional(v.string()),
	parents: v.optional(v.array(v.string())),
	children: v.optional(v.array(v.string())),
	content: v.optional(v.string()),
	status: v.optional(v.number()),
	todaysTask: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	created: v.optional(v.number()),
	lastEdit: v.optional(v.number()),
})
const argsUpdateTask = v.object({
	id: v.string(),
	userAuthId: v.optional(v.string()),
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

		const result = await _createTask(ctx, {
			...createDetail,
			userAuthId,
		});
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
		const created: IAppNode<ClientTaskData & { givenId: string | undefined }, number>[] = [];
		let affected: ClientNode[] = [];
		for (const createDetail of createDetails) {
			const { created: createdTask, affected: affectedTasks } = await _createTask(ctx, {
				...createDetail,
				userAuthId,
			});
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

export async function _createTask(ctx: MutationCtx, createDetail: CreateTaskArgs & { userAuthId: string }): Promise<{ created: IAppNode<ClientTaskData & { givenId: string | undefined }, number>, affected: ClientNode[] }> {
	const now = Date.now();

	const { parents: finalParents } = await validateParentsAndProject(ctx, createDetail.parents ?? [], createDetail.userAuthId);

	// Insert node with nested data structure
	const newId = await ctx.db.insert("nodes", {
		userAuthId: createDetail.userAuthId,
		parents: finalParents,
		children: createDetail.children ?? [],
		lastEdit: createDetail.lastEdit ?? now,
		created: createDetail.created ?? now,
		data: {
			type: "task" as const,
			title: createDetail.title,
			content: createDetail.content,
			status: createDetail.status ?? 0,
			todaysTask: createDetail.todaysTask,
			dueDate: createDetail.dueDate,
		},
	});

	// Get created node
	const createdNode = await ctx.db.get(newId);
	if (!createdNode) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created node", ctx: newId });

	// Propagate relationship changes
	const affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: null, newTask: createdNode }
	]);

	return {
		created: {
			...cleanNodeForClient(createdNode), data: {
				...createdNode.data,
				type: "task" as const, // Assure typescript it can rest easy
				givenId: createDetail.id
			}
		},
		affected: affected.map(cleanNodeForClient)
	};
}

export const test = internalMutation({ args: {}, handler: () => { } })

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
		const updated: ClientNode[] = [];
		let affected: ClientNode[] = [];
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

export async function _updateTask(ctx: MutationCtx, update: UpdateTaskParams<number>): Promise<{ updated: ClientNode, affected: ClientNode[] }> {
	const nodeId = update.id as Id<"nodes">;

	// Get old node state
	const oldNode = await ctx.db.get(nodeId);
	if (!oldNode) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: update.id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== oldNode.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: update.id });
	}

	// Enforce project constraints
	if (oldNode.data.type === "project" && (update.parents || update.addParents || update.removeParents)) {
		throw new ConvexError({ type: "InvalidState", msg: "Root project cannot have parents modified", ctx: update.id });
	}

	const now = Date.now();

	// Resolve relations operations into arrays
	// Initialize with static set. If no update is provided, 
	// use the old node's relations and prepare for deltas
	let parents = [...(update.parents ?? oldNode.parents ?? [])];
	let children = [...(update.children ?? oldNode.children ?? [])];

	if (update.addParents) {
		parents = [...parents, ...update.addParents];
	}

	if (update.removeParents) {
		if (parents.length === 1 && oldNode.data.type !== "project") {
			const project = await resolveProjectAncestor(ctx, parents[0], oldNode.userAuthId);
			parents = [project._id];
		}
		parents = parents.filter(id => !update.removeParents!.includes(id));
	}

	if (update.addChildren) {
		children = [...children, ...update.addChildren];
	}

	if (update.removeChildren) {
		children = children.filter(id => !update.removeChildren!.includes(id));
	}


	// Validate parents using shared function (must remain non-empty and share project ancestor)
	const { parents: normalizedParents } = await validateParentsAndProject(ctx, parents, oldNode.userAuthId);
	parents = normalizedParents;

	// Build patch object with proper nested structure
	const patchData: Partial<DBNode> = {
		parents,
		children,
		lastEdit: update.lastEdit ?? now,
	};

	// Handle nested data updates
	const dataUpdates: Partial<TaskData<number>> = {};
	if (update.title !== undefined) dataUpdates.title = update.title;
	if (update.content !== undefined) dataUpdates.content = update.content;
	if (update.status !== undefined) dataUpdates.status = update.status;
	if (update.todaysTask !== undefined) dataUpdates.todaysTask = update.todaysTask;
	if (update.dueDate !== undefined) dataUpdates.dueDate = update.dueDate;

	// Merge data updates with existing data
	if (Object.keys(dataUpdates).length > 0) {
		patchData.data = {
			...oldNode.data,
			...dataUpdates,
		};
	}

	// Apply patch
	await ctx.db.patch(nodeId, patchData);

	// Get updated node
	const updated = await ctx.db.get(nodeId);
	if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated node", ctx: nodeId });

	// Reorder completed tasks to the end of their parents' lists
	const extraAffected: DBNode[] = [];
	// Check for completion status change (incomplete -> complete)
	if (
		oldNode.data.type === 'task' &&
		update.status === TaskStatus.complete &&
		oldNode.data.status !== TaskStatus.complete
	) {
		for (const pid of parents) {
			const parentId = pid as Id<"nodes">;
			const parent = await ctx.db.get(parentId);
			if (parent && parent.children) {
				const idx = parent.children.indexOf(nodeId);
				// Only move if not already at the end
				if (idx !== -1 && idx !== parent.children.length - 1) {
					const newChildren = [...parent.children];
					newChildren.splice(idx, 1);
					newChildren.push(nodeId);

					await ctx.db.patch(parentId, { children: newChildren });

					const patched = await ctx.db.get(parentId);
					if (patched) extraAffected.push(patched);
				}
			}
		}
	}

	// Propagate relationship changes
	let affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: oldNode, newTask: updated }
	]);

	// Merge affected lists (deduplicating by ID)
	const affectedMap = new Map<string, DBNode>();
	for (const node of extraAffected) affectedMap.set(node._id, node);
	for (const node of affected) affectedMap.set(node._id, node);
	affected = Array.from(affectedMap.values());

	return {
		updated: cleanNodeForClient(updated),
		affected: affected.map(cleanNodeForClient)
	};
}


export const deleteTask = mutation({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		return await _deleteTask(ctx, id as Id<"nodes">);
	},
});

export const deleteTasks = mutation({
	args: { ids: v.array(v.string()) },
	handler: async (ctx, { ids }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}

		let affected: ClientNode[] = [];
		for (const id of ids) {
			const { affected: affectedTasks } = await _deleteTask(ctx, id as Id<"nodes">);
			affected.push(...affectedTasks);
		}

		// Dedup affected
		affected = affected.filter((t, index, self) => self.findIndex(t2 => t2.id === t.id) === index);
		return { affected };
	},
});

export async function _deleteTask(ctx: MutationCtx, id: Id<"nodes">): Promise<{ affected: ClientNode[] }> {

	// Get node
	const node = await ctx.db.get(id);
	if (!node) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== node.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: id });
	}


	// Propagate relationship changes before deletion
	const affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: node, newTask: null }
	]);


	// Delete node
	await ctx.db.delete(id);


	return { affected: affected.map(cleanNodeForClient) };
}

const CURRENT_EXPORT_VERSION = "0.0.0";
export const importData = mutation({
	args: { data: v.string(), mode: v.optional(v.union(v.literal("replace"), v.literal("add"), v.literal("attemptMerge"))) },
	handler: async (ctx, { data, mode = "add" }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;

		let parsed: ExportedData;
		try {
			parsed = JSON.parse(data);
		} catch (error) {
			console.error(error)
			throw new ArgumentError("Invalid JSON format", data, { cause: error });
		}

		if (!parsed.version || !EXPORT_VERSIONS.includes(parsed.version) && parsed.version !== "0.0.1") {
			throw new ArgumentError("Invalid export format: missing version or tasks", parsed);
		}

		let dataToImport: IAppNode<AppData<number>, number>[] = [];

		switch (parsed.version) {
			case CURRENT_EXPORT_VERSION:
				if (parsed.data.length == 0) return 0;
				dataToImport = parsed.data.map((node: IAppNode<AppData<number>, number>) => {
					const created = typeof node.created === 'string' ? new Date(node.created).getTime() : node.created;
					const lastEdit = typeof node.lastEdit === 'string' ? new Date(node.lastEdit).getTime() : node.lastEdit;

					// Extract id for mapping, override userAuthId
					return {
						id: node.id,
						userAuthId, // Override with current user
						parents: node.parents ?? [],
						children: node.children ?? [],
						created,
						lastEdit,
						data: node.data,
					} satisfies IAppNode<TaskData<number> | ProjectData<number>, number>;
				});
				break;
			default:
				throw new ConvexError({ type: "NotImplementedError", msg: `Unsupported export version: ${parsed.version}` });
		}

		// Filter out references to tasks not in the import set
		const allImportIds = new Set(dataToImport.map(t => t.id!));
		for (const task of dataToImport) {
			task.parents = task.parents?.filter(p => allImportIds.has(p)) ?? [];
			task.children = task.children?.filter(c => allImportIds.has(c)) ?? [];
		}

		if (mode === "replace") {
			// Get all existing nodes (tasks) and delete them
			const existingNodes = await ctx.db
				.query("nodes")
				.withIndex("by_user_type", (q) => q.eq("userAuthId", userAuthId).eq("data.type", "task"))
				.collect();
			// Filter out root projects - they're hidden from clients
			if (existingNodes.length > 0) {
				const existingIds = existingNodes.map(n => n._id);
				for (const id of existingIds) {
					await _deleteTask(ctx, id);
				}
			}
		}

		// Create all nodes with their original relationships (old IDs)
		// Build mapping: oldId -> newId
		const idMapping = new Map<string, Id<"nodes">>();
		const createdNodes: Array<{ oldId: string; newId: Id<"nodes">; node: DBNode }> = [];
		const now = Date.now();
		const rootProject = await getOrCreateProject(ctx, userAuthId);

		for (const createDetail of dataToImport) {
			const oldId = createDetail.id!;
			// Create new ids for every imported node so we don't import bad references
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (createDetail as any).id;

			// Create node with original relationships (old IDs)
			// Don't normalize parents - we'll handle that after remapping
			let newId: Id<'nodes'>;
			if (createDetail.data.type === 'project') {
				newId = rootProject._id;
				createdNodes.push({ oldId, newId, node: rootProject });
			} else {
				newId = await ctx.db.insert("nodes", createDetail);
				const createdNode = await ctx.db.get(newId);
				if (!createdNode) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created node", ctx: newId });
				createdNodes.push({ oldId, newId, node: createdNode });
			}

			idMapping.set(oldId, newId);
		}

		// Remap relationships and establish bidirectional consistency
		// For each node: remap old IDs to new IDs, normalize parents, and update related nodes
		for (const { newId, node } of createdNodes) {
			// Remap old IDs to new IDs
			const remappedParents = (node.parents ?? []).map(oldId => idMapping.get(oldId)).filter((id): id is Id<"nodes"> => !!id).map(String);
			const remappedChildren = (node.children ?? []).map(oldId => idMapping.get(oldId)).filter((id): id is Id<"nodes"> => !!id).map(String);

			// Normalize parents (attach to root if empty, remove root if multiple parents)
			let normalizedParents: string[];
			if (remappedParents.length === 0) {
				normalizedParents = [rootProject._id];
			} else if (remappedParents.length > 1) {
				// Multiple parents - remove root if present
				normalizedParents = remappedParents.filter(id => id !== rootProject._id);
			} else {
				normalizedParents = remappedParents;
			}

			// Update this node with remapped relationships
			await ctx.db.patch(newId, {
				parents: normalizedParents,
				children: remappedChildren,
			});

			// Update root.children if attached to root
			if (normalizedParents.length === 1 && normalizedParents[0] === rootProject._id) {
				const currentRoot = await ctx.db.get(rootProject._id);
				if (currentRoot) {
					const rootChildren = [...(currentRoot.children ?? [])];
					if (!rootChildren.includes(newId)) {
						rootChildren.push(newId);
						await ctx.db.patch(rootProject._id, {
							children: rootChildren,
							lastEdit: now,
						});
					}
				}
			}

			// Establish bidirectional relationships: update children to have this as parent
			for (const childIdStr of remappedChildren) {
				const childId = childIdStr as Id<"nodes">;
				const child = await ctx.db.get(childId);
				if (child) {
					const childParents = child.parents ?? [];
					if (!childParents.includes(newId)) {
						await ctx.db.patch(childId, {
							parents: [...childParents, newId],
						});
					}
				}
			}

			// Establish bidirectional relationships: update parents to have this as child
			for (const parentIdStr of normalizedParents) {
				if (parentIdStr === rootProject._id) continue; // Root handled separately above
				const parentId = parentIdStr as Id<"nodes">;
				const parent = await ctx.db.get(parentId);
				if (parent) {
					const parentChildren = parent.children ?? [];
					if (!parentChildren.includes(newId)) {
						await ctx.db.patch(parentId, {
							children: [...parentChildren, newId],
						});
					}
				}
			}
		}

		return createdNodes.length;
	},
});

export const exportData = query({
	args: { subtreeId: v.optional(v.string()) },
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;


		const nodesResult = await ctx.db.query('nodes').withIndex('by_user', q => q.eq('userAuthId', userAuthId)).collect();

		const tasks = nodesResult.map(n => cleanNodeForClient(n));

		const exportedData: ExportedData = {
			version: CURRENT_EXPORT_VERSION,
			exportedAt: new Date().getTime(),
			data: tasks,
		};

		return exportedData;
	}
})

//#endregion


//#region Observers

export const getTask = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const row = await ctx.db.get(id as Id<"nodes">);
		if (!row) {
			throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });
		}
		return cleanNodeForClient(row);
	},
});

export const getTasks = query({
	args: { ids: v.array(v.string()) },
	handler: async (ctx, { ids }) => {
		const rows = await Promise.all(ids.map((i) => ctx.db.get(i as Id<"nodes">)));
		const found = rows.filter(Boolean) as Doc<"nodes">[];
		if (found.length !== ids.length) {
			throw new ConvexError({ type: "NotFoundError", msg: "Some nodes not found", ctx: ids.map((x) => x).join(",") });
		}
		return found.map(cleanNodeForClient);
	},
});

export const getAllUserTasks = query({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		const rows = await ctx.db
			.query("nodes")
			.withIndex("by_user", (q) => q.eq("userAuthId", userId))
			.collect();
		// Filter out root projects - they're hidden from clients
		const tasks = rows.filter(n => n.data.type === "task");
		return tasks.map(cleanNodeForClient);
	},
});

export const getChildrenOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const parent = await ctx.db.get(id as Id<"nodes">);
		if (!parent) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });
		const childIds = parent.children ?? [];
		if (childIds.length === 0) return [];

		// Fetch only the children we need, preserving order
		const childDocs = await Promise.all(childIds.map((cid) => ctx.db.get(cid as Id<"nodes">)));
		const ordered = childDocs.filter(
			(n): n is NonNullable<typeof n> => !!n
		);
		return ordered.map(cleanNodeForClient);
	},
});

export const getParentsOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const child = await ctx.db.get(id as Id<"nodes">);
		if (!child) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });
		const parentIds = child.parents ?? [];
		if (parentIds.length === 0) return [];
		const parentDocs = await Promise.all(parentIds.map((pid) => ctx.db.get(pid as Id<"nodes">)));
		const filtered = parentDocs.filter((n): n is NonNullable<typeof n> => !!n);
		return filtered.map(cleanNodeForClient);
	},
});

export const getSiblingsOf = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		// 0) Load the node
		const self = await ctx.db.get(id as Id<"nodes">);
		if (!self) {
			throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });
		}

		// Utility: stable sort siblings according to parent.children order
		function sortSiblingsByParentChildren(
			parent: DBNode,
			siblings: DBNode[]
		): DBNode[] {
			const childIds = Array.isArray(parent.children) ? parent.children : [];
			if (childIds.length === 0) return siblings.slice();

			// Build index map for O(1) position lookup
			const pos = new Map<Id<"nodes">, number>();
			for (let i = 0; i < childIds.length; i++) {
				pos.set(childIds[i] as Id<"nodes">, i);
			}

			return siblings
				.map((t, idx) => {
					const nodeId = t._id;
					const order = pos.has(nodeId) ? pos.get(nodeId)! : Infinity;
					return { t, order, idx };
				})
				.sort((a, b) => (a.order === b.order ? a.idx - b.idx : a.order - b.order))
				.map((x) => x.t);
		}

		// Pre-processing data
		const seen = new Map<Id<"nodes">, Doc<"nodes"> | null>();
		const siblings = new Map<Doc<"nodes">, Doc<"nodes">[]>();
		const addSibling = (parent: Doc<"nodes">, sibling: Doc<"nodes">) => {
			const arr = siblings.get(parent);
			if (arr) arr.push(sibling);
			else siblings.set(parent, [sibling]);
		};

		// 2-a) Handle root nodes
		let parentIds = self.parents ?? [];
		if (parentIds.length === 0) {
			const root = await getOrCreateProject(ctx, self.userAuthId);
			parentIds = [root._id];
		}

		// 2-b) Fetch only the parents we need
		const parentFetches = parentIds.map((pid) =>
			ctx.db.get(pid as Id<"nodes">)
		);
		const parents = await Promise.all(parentFetches);
		const existingParents = parents.filter(
			(p): p is NonNullable<typeof p> => !!p
		);

		if (existingParents.length === 0) {
			throw new ConvexError({ type: "NotFoundError", msg: "Node parents not found for sibling calculation", ctx: id });
		}

		// 3) Compute de-duplicated sibling ids from parents' children arrays
		for (const parent of existingParents) {
			const childIds = parent.children ?? [];
			if (!Array.isArray(childIds) || childIds.length === 0) {
				// Even if parent has no children array, still include self as the only "sibling" if not root
				if (self.data.type !== "project") addSibling(parent, self);
				continue;
			}

			for (const cid of childIds as Array<Id<"nodes">>) {
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
			if (self.data.type !== "project") addSibling(parent, self);
		}

		// 4) Sort each siblings array to match parent.children order (stable, unknowns last)
		const sortedEntries: Array<[Doc<"nodes">, Doc<"nodes">[]]> = [];
		for (const [parent, group] of siblings) {
			const sorted = sortSiblingsByParentChildren(parent, group);
			sortedEntries.push([parent, sorted]);
		}

		return sortedEntries.map(([parent, siblings]) => [cleanNodeForClient(parent), siblings.map(cleanNodeForClient)]) as [ClientTaskNode, ClientTaskNode[]][];
	},
});

export const getRootTasks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return []; // TODO:UX/DX Log and error

		// Get root project for user
		const root = await getOrCreateProject(ctx, identity.subject);

		// Return root's children (parentless tasks)
		const childIds = root.children ?? [];
		if (childIds.length === 0) return [];

		const childDocs = await Promise.all(childIds.map((cid) => ctx.db.get(cid as Id<"nodes">)));

		return childDocs.filter((n): n is NonNullable<typeof n> => !!n).map(cleanNodeForClient);
	},
});

export const getProjects = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return []; // TODO:UX/DX Log and error
		const projects = await ctx.db.query("nodes").withIndex("by_user_type", (q) => q.eq("userAuthId", identity.subject).eq("data.type", "project")).collect();
		return projects.map(cleanNodeForClient);
	},
});

export const getProjectSubtree = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });

		const rootId = id as Id<"nodes">;
		const root = await ctx.db.get(rootId);
		if (!root) throw new ConvexError({ type: "NotFoundError", msg: "Project not found", ctx: id });
		if (root.userAuthId !== identity.subject) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: id });
		}

		// Brute force: fetch all nodes for user, then traverse children to collect subtree
		const nodes = await ctx.db.query("nodes").withIndex("by_user", (q) => q.eq("userAuthId", identity.subject)).collect();
		const nodeMap = new Map<string, DBNode>(nodes.map((n) => [n._id, n]));

		const visited = new Set<string>();
		const queue: string[] = [root._id];
		const subtree: DBNode[] = [];

		while (queue.length > 0) {
			const currentId = queue.shift()!;
			if (visited.has(currentId)) continue;
			visited.add(currentId);

			const node = nodeMap.get(currentId);
			if (!node) continue;

			subtree.push(node);
			for (const childId of node.children ?? []) {
				if (!visited.has(childId)) queue.push(childId);
			}
		}

		return subtree.map(cleanNodeForClient);
	},
});

export const getSubtree = query({
	args: { id: v.string() },
	handler: async (ctx, { id }) => {
		const project = await ctx.db.get(id as Id<"nodes">);
		if (!project) throw new ConvexError({ type: "NotFoundError", msg: "Project not found", ctx: id });
		return project.children ?? [];
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
			.query("nodes")
			.withIndex("by_users_daily_tasks", (q) => q.eq("userAuthId", identity.subject).gte("data.todaysTask", start).lt("data.todaysTask", next))
			.collect();
		return rows.map(cleanNodeForClient);
	},
});

export const getPrioritizedTasks = query({
	args: { limit: v.number() },
	handler: async (ctx, { limit }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError({ type: "NotAuthorizedError", msg: "Auth Identity not found" });

		const nodes = await ctx.db
			.query("nodes")
			.withIndex("by_user", (q) => q.eq("userAuthId", identity.subject))
			.collect();

		// Filter out root projects - they're hidden from clients
		const taskNodes = nodes.filter(n => n.data.type !== "project");
		// Get root to start traversal from root's children
		const root = await getOrCreateProject(ctx, identity.subject);
		const nodesMap = new Map(taskNodes.map((n) => [n._id, n] as [string, DBNode]));
		const sorter = (a?: DBNode, b?: DBNode) => {
			// TODO This is going to need context from the parent to determine sibling priority...
			if (!a) return -1; if (!b) return 1; return 0; // (b.priority ?? 0) - (a.priority ?? 0);
		};
		const todo: DBNode[] = [];
		const seen = new Set<string>();
		const walk = (node: DBNode) => {
			if (seen.has(node._id)) return;
			else seen.add(node._id);

			if (todo.length === limit) return;

			if (node.children.length === 0) {
				if (node.data.status === 0) todo.push(node);
			} else {
				const children = node.children.map((id) => nodesMap.get(id)).sort(sorter);
				for (const c of children) { if (c && c.data.status === 0) walk(c); }

				/* TODO:discuss This allows "tasks" that may be used for grouping
				to show up in the planner's suggestions. This should probably have
				some form of configuration, because it's awkward having to manually
				"complete" a task that isn't really a task at all.
				This will likely play into the node-type system if we ever get there...
				*/
				if (children.every((c) => !c || c.data.status !== 0) && node.data.status === 0) todo.push(node);
			}
		};
		// Start from root's children (parentless tasks)
		const rootChildren = (root.children ?? []).map(id => nodesMap.get(id)).filter((n): n is DBNode => !!n).sort(sorter);
		for (const r of rootChildren) { if (todo.length === limit) break; walk(r); }
		return todo.map(cleanNodeForClient);
	},
});

export const searchTasks = query({
	args: { searchTerm: v.string() },
	handler: async () => {
		throw new ConvexError({ type: "NotImplementedError", msg: "Convex.tasks.searchTasks" });
	},
});


//#endregion


//#region Utilities

/**
 * Gets or creates the root project for a user. Ensures exactly one root per user.
 * Root projects are hidden from clients and serve as the parent for all parentless tasks.
 */
// TODO:refactor This will eventually need to be removed,
// and instead error if a task is created without a parent
export async function getOrCreateProject(ctx: QueryCtx | MutationCtx, userAuthId: string): Promise<DBNode> {
	// Look for existing root project
	const existingRoots = await ctx.db
		.query("nodes")
		.withIndex("by_user_type", (q) => q.eq("userAuthId", userAuthId).eq("data.type", "project"))
		.collect();

	if (existingRoots.length === 1) {
		return existingRoots[0];
	} else if (existingRoots.length > 1) {
		// TODO: Consider cleanup migration if multiple roots found
		const root = existingRoots.find(r => r.data.title === "");
		if (root) {
			return root;
		} else {
			throw new ConvexError({ type: "NotImplementedError", msg: "Multiple root projects found for user" });
		}
	} else if ('insert' in ctx.db) {
		// Create root project
		const now = Date.now();
		const rootId = await ctx.db.insert("nodes", {
			userAuthId,
			parents: [], // Root has no parents
			children: [], // Will be populated as parentless tasks are attached
			lastEdit: now,
			created: now,
			data: {
				type: "project" as const,
				title: "", // Empty title - root is hidden from clients
				status: 0, // active
				content: undefined,
				dueDate: undefined,
			},
		});

		const root = await ctx.db.get(rootId);
		if (!root) {
			throw new ConvexError({ type: "Error", msg: "Failed to create root project" });
		}
		return root;
	}
	else throw new InvalidStateError("Invalid context for getRootProject");
}

type NodeCache = Map<string, DBNode | null>;

async function getNodeCached(ctx: QueryCtx | MutationCtx, id: string, cache?: NodeCache): Promise<DBNode | null> {
	if (cache && cache.has(id)) {
		return cache.get(id) ?? null;
	}
	const node = await ctx.db.get(id as Id<"nodes">);
	if (cache) {
		cache.set(id, node ?? null);
	}
	return node ?? null;
}

function dedupePreserveOrder(ids: string[]): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (const id of ids) {
		if (!seen.has(id)) {
			seen.add(id);
			ordered.push(id);
		}
	}
	return ordered;
}

async function resolveProjectAncestor(
	ctx: QueryCtx | MutationCtx,
	startId: string,
	userAuthId: string,
	cache?: NodeCache
): Promise<DBNode> {
	const visited = new Set<string>();
	let currentId = startId;

	while (true) {
		if (visited.has(currentId)) {
			throw new ConvexError({ type: "InvalidState", msg: "Cycle while resolving project ancestor", ctx: currentId });
		}
		visited.add(currentId);

		const node = await getNodeCached(ctx, currentId, cache);
		if (!node) {
			throw new ConvexError({ type: "NotFoundError", msg: "Parent not found for project resolution", ctx: currentId });
		}
		if (node.userAuthId !== userAuthId) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Parent belongs to another user", ctx: currentId });
		}
		if (node.data.type === "project") {
			return node;
		}
		const nextParent = node.parents?.[0];
		if (!nextParent) {
			throw new ConvexError({ type: "InvalidState", msg: "No project ancestor found in parent chain", ctx: currentId });
		}
		currentId = nextParent;
	}
}

async function validateParentsAndProject(
	ctx: QueryCtx | MutationCtx,
	parents: string[],
	userAuthId: string,
	cache?: NodeCache
): Promise<{ parents: string[]; project: DBNode }> {
	const normalizedParents = dedupePreserveOrder(parents.map(String));
	if (normalizedParents.length === 0) {
		throw new ConvexError({ type: "InvalidState", msg: "Task must have at least one parent" });
	}

	for (const parentId of normalizedParents) {
		const parentNode = await getNodeCached(ctx, parentId, cache);
		if (!parentNode) {
			throw new ConvexError({ type: "NotFoundError", msg: "Parent not found", ctx: parentId });
		}
		if (parentNode.userAuthId !== userAuthId) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Parent belongs to another user", ctx: parentId });
		}
	}

	const projectAncestor = await resolveProjectAncestor(ctx, normalizedParents[0], userAuthId, cache);

	for (let i = 1; i < normalizedParents.length; i++) {
		const parentProject = await resolveProjectAncestor(ctx, normalizedParents[i], userAuthId, cache);
		if (parentProject._id !== projectAncestor._id) {
			throw new ConvexError({ type: "InvalidState", msg: "All parents must share the same project ancestor", ctx: normalizedParents[i] });
		}
	}

	// If multiple parents were provided and one of them is the project ancestor itself,
	// drop the project parent to avoid duplicating the anchor alongside concrete parents.
	let finalParents = normalizedParents;
	if (finalParents.length > 1) {
		const ancestorId = projectAncestor._id;
		finalParents = finalParents.filter(p => p !== ancestorId);
		if (finalParents.length === 0) {
			finalParents = [ancestorId];
		}
	}

	return { parents: finalParents, project: projectAncestor };
}

async function propagateRelationshipChanges(
	ctx: MutationCtx,
	changes: Array<{ oldTask: DBNode | null; newTask: DBNode | null }>
): Promise<DBNode[]> {
	// Convert to ITask format
	const taskChanges = changes.map(({ oldTask, newTask }) => ({
		oldTask: oldTask ? cleanNodeForClient(oldTask) : null,
		newTask: newTask ? cleanNodeForClient(newTask) : null,
	}));

	// Calculate relationship updates using shared logic
	const updates = calculateRelationshipUpdates(taskChanges);

	const affectedNodes: DBNode[] = [];
	const ancestorCache: NodeCache = new Map();

	// Apply each update
	for (const { taskId, operations } of updates) {
		const relatedNode = await ctx.db.get(taskId as Id<"nodes">);
		if (!relatedNode) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: taskId });
		const isProjectNode = relatedNode.data.type === "project";

		// Apply operations using shared logic
		const updated = applyRelationshipOperations(cleanNodeForClient(relatedNode), operations);
		const previousParents = relatedNode.parents ?? [];

		let normalizedParents = updated.parents ?? [];
		let adoptedProjectId: string | null = null;
		if (normalizedParents.length === 0) {
			if (isProjectNode) {
				normalizedParents = previousParents;
			} else if (previousParents.length === 0) {
				throw new ConvexError({ type: "InvalidState", msg: "Cannot orphan node with no project ancestor", ctx: taskId });
			}
			if (!isProjectNode) {
				const ancestor = await resolveProjectAncestor(ctx, previousParents[0], relatedNode.userAuthId, ancestorCache);
				normalizedParents = [ancestor._id];
				adoptedProjectId = ancestor._id;
			}
		} else {
			({ parents: normalizedParents } = await validateParentsAndProject(ctx, normalizedParents, relatedNode.userAuthId, ancestorCache));
		}

		// Patch the DB with normalized parents
		await ctx.db.patch(relatedNode._id, {
			parents: normalizedParents,
			children: updated.children,
		});

		// If we adopted the project ancestor, ensure the ancestor lists this node as a child
		if (adoptedProjectId) {
			const projectNode = await getNodeCached(ctx, adoptedProjectId, ancestorCache);
			if (projectNode) {
				const projectChildren = projectNode.children ?? [];
				if (!projectChildren.includes(relatedNode._id)) {
					await ctx.db.patch(projectNode._id, { children: [...projectChildren, relatedNode._id] });
					ancestorCache.set(adoptedProjectId, { ...projectNode, children: [...projectChildren, relatedNode._id] });
				}
			}
		}

		const refreshed = await ctx.db.get(relatedNode._id);
		if (refreshed) affectedNodes.push(refreshed);
	}

	// Deduplicate
	const seen = new Set<string>();
	return affectedNodes.filter(t => {
		const key = t._id;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function cleanNodeForClient(node: DBNode) {
	const { _id, _creationTime, ...rest } = node;
	const t: ClientNode<AppData<number>> = {
		...rest,
		id: _id,
		created: node.created ?? _creationTime,
	};

	return t;
}

//#endregion