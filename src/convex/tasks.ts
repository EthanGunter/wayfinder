import { ArgumentError } from "$domain/errors";
import type { Doc, Id } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { applyRelationshipOperations, calculateRelationshipUpdates } from "$domain/models/task";
import type { CreateNodeParams, CreateTaskParams, ExportedData, Task, TaskData, UpdateTaskParams } from "$domain/models/task";

import type { MutationCtx } from "./_generated/server";
import type { GraphData as GraphData, IGraphNode } from "$domain/models/node";
import type { ProjectData } from "$domain/models/project";

//#region Types

type DBNode = Doc<'nodes'>;
type ClientNode<T extends GraphData<number>> = IGraphNode<T, number>;
type ClientTaskData = TaskData<number>;
type ClientTaskNode = IGraphNode<ClientTaskData, number>;
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
		const created: IGraphNode<ClientTaskData & { givenId: string | undefined }, number>[] = [];
		let affected: ClientTaskNode[] = [];
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

async function _createTask(ctx: MutationCtx, createDetail: CreateTaskArgs & { userAuthId: string }): Promise<{ created: IGraphNode<ClientTaskData & { givenId: string | undefined }, number>, affected: ClientTaskNode[] }> {
	const now = Date.now();

	// Normalize parents (attach to root if empty)
	let finalParents = createDetail.parents ?? [];
	if (finalParents.length === 0) {
		const rootProject = await getOrCreateProject(ctx, createDetail.userAuthId);
		finalParents = [rootProject._id];
	}

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

	// Update root.children if attached to root
	const rootProject = await getOrCreateProject(ctx, createDetail.userAuthId);
	if (finalParents.length === 1 && finalParents[0] === rootProject._id) {
		const rootChildren = [...(rootProject.children ?? [])];
		if (!rootChildren.includes(String(newId))) {
			rootChildren.push(String(newId));
			await ctx.db.patch(rootProject._id, {
				children: rootChildren,
				lastEdit: now,
			});
		}
	}

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
		const updated: ClientTaskNode[] = [];
		let affected: ClientTaskNode[] = [];
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

async function _updateTask(ctx: MutationCtx, update: UpdateTaskParams<number>): Promise<{ updated: ClientTaskNode, affected: ClientTaskNode[] }> {
	const nodeId = update.id as Id<"nodes">;

	// Get old node state
	const oldNode = await ctx.db.get(nodeId);
	if (!oldNode) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: update.id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== oldNode.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: update.id });
	}

	// Enforce root constraints
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
		parents = parents.filter(id => !update.removeParents!.includes(id));
	}

	if (update.addChildren) {
		children = [...children, ...update.addChildren];
	}

	if (update.removeChildren) {
		children = children.filter(id => !update.removeChildren!.includes(id));
	}

	// Normalize parents using shared function
	parents = await normalizeTaskParents(ctx, oldNode, parents, nodeId);

	// Build patch object with proper nested structure
	const patchData: any = {
		parents,
		children,
		lastEdit: update.lastEdit ?? now,
	};

	// Handle nested data updates
	const dataUpdates: any = {};
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

	// Propagate relationship changes
	let affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: oldNode, newTask: updated }
	]);

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

		let affected: ClientTaskNode[] = [];
		for (const id of ids) {
			const { affected: affectedTasks } = await _deleteTask(ctx, id as Id<"nodes">);
			affected.push(...affectedTasks);
		}

		// Dedup affected
		affected = affected.filter((t, index, self) => self.findIndex(t2 => t2.id === t.id) === index);
		return { affected };
	},
});

async function _deleteTask(ctx: MutationCtx, id: Id<"nodes">): Promise<{ affected: ClientTaskNode[] }> {
	// Get node
	const node = await ctx.db.get(id);
	if (!node) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: id });

	// Authorize ownership
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || identity.subject !== node.userAuthId) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of node", ctx: String(id) });
	}

	// Prevent root deletion
	if (node.data.type === "project") {
		throw new ConvexError({ type: "InvalidState", msg: "Root project cannot be deleted", ctx: String(id) });
	}

	// Propagate relationship changes before deletion
	let affected = await propagateRelationshipChanges(ctx, [
		{ oldTask: node, newTask: null }
	]);

	// Attach orphaned nodes (those with no parents) to root
	const orphanedNodes: DBNode[] = affected.filter(n => n.data.type !== "project" && (n.parents?.length ?? 0) === 0);
	if (orphanedNodes.length > 0) {
		const rootProject = await getOrCreateProject(ctx, node.userAuthId);
		const rootId = String(rootProject._id);

		// Propagate attachment of orphans to root
		const now = Date.now();
		const orphanChanges = orphanedNodes.map(orphan => {
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

		// Merge affected nodes, deduplicating
		const affectedMap = new Map<string, DBNode>();
		for (const n of affected) {
			affectedMap.set(String(n._id), n);
		}
		for (const n of orphanAffected) {
			affectedMap.set(String(n._id), n);
		}
		for (const c of orphanChanges) {
			affectedMap.set(String(c.newTask._id), c.newTask);
		}

		affected = Array.from(affectedMap.values());
	}

	// Delete node
	await ctx.db.delete(id);

	return { affected: affected.map(cleanNodeForClient) };
}

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

		if (!parsed.version) {
			throw new ArgumentError("Invalid export format: missing version or tasks", parsed);
		}

		let dataToImport: IGraphNode<any, number>[] = [];
		switch (parsed.version) {
			case "0.0.0": if ((parsed as any).tasks.length == 0) return 0;
				// Convert ISO strings to timestamps (numbers) for Convex
				dataToImport = (parsed as any).tasks.map((node: { // Static type to persist historical data shape
					id: string;
					userAuthId: string;
					type: "task" | "root";
					title: string;
					content: string;
					status: number;
					parents: string[];
					children: string[];
					todaysTask: number | undefined;
					dueDate: number | undefined;
					created: number;
					lastEdit: number;
				}) => {
					if (node.type === "task") {
						return {
							id: node.id,
							userAuthId, // Override with current user
							parents: node.parents,
							children: node.children,
							created: new Date(node.created).getTime(),
							lastEdit: new Date(node.lastEdit).getTime(),
							data: {
								type: "task",
								title: node.title,
								content: node.content,
								status: node.status,
								todaysTask: node.todaysTask ? new Date(node.todaysTask).getTime() : undefined,
								dueDate: node.dueDate ? new Date(node.dueDate).getTime() : undefined,
							},
						} satisfies Task<number>
					} else if (node.type === "root") {
						return {
							id: node.id,
							userAuthId, // Override with current user
							parents: node.parents,
							children: node.children,
							created: new Date(node.created).getTime(),
							lastEdit: new Date(node.lastEdit).getTime(),
							data: {
								type: "project",
								title: node.title,
								content: node.content,
								status: node.status,
								dueDate: node.dueDate ? new Date(node.dueDate).getTime() : undefined,
							},
						} satisfies IGraphNode<ProjectData<number>, number>
					} else {
						throw new ConvexError({ type: "InvalidState", msg: "Failed to parse node type", ctx: { version: '0.0.0', data: node } });
					}
				});
				break;
			case "0.0.1":
				if ((parsed as any).nodes.length == 0) return 0;
				// v0.0.1 uses nodes array with nested data structure (already in INode format)
				dataToImport = (parsed as any).nodes.map((node: IGraphNode<TaskData<number> | ProjectData<number>, number>) => {
					// Extract id for mapping, override userAuthId
					return {
						id: node.id,
						userAuthId, // Override with current user
						parents: node.parents ?? [],
						children: node.children ?? [],
						created: node.created,
						lastEdit: node.lastEdit,
						data: node.data,
					} satisfies IGraphNode<TaskData<number> | ProjectData<number>, number>;
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

			// Create node with original relationships (old IDs)
			// Don't normalize parents - we'll handle that after remapping
			delete (createDetail as any).id;
			const newId = await ctx.db.insert("nodes", createDetail);

			idMapping.set(oldId, newId);

			const createdNode = await ctx.db.get(newId);
			if (!createdNode) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created node", ctx: newId });
			createdNodes.push({ oldId, newId, node: createdNode });
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
				normalizedParents = [String(rootProject._id)];
			} else if (remappedParents.length > 1) {
				// Multiple parents - remove root if present
				normalizedParents = remappedParents.filter(id => id !== String(rootProject._id));
			} else {
				normalizedParents = remappedParents;
			}

			// Update this node with remapped relationships
			await ctx.db.patch(newId, {
				parents: normalizedParents,
				children: remappedChildren,
			});

			// Update root.children if attached to root
			if (normalizedParents.length === 1 && normalizedParents[0] === String(rootProject._id)) {
				const currentRoot = await ctx.db.get(rootProject._id);
				if (currentRoot) {
					const rootChildren = [...(currentRoot.children ?? [])];
					if (!rootChildren.includes(String(newId))) {
						rootChildren.push(String(newId));
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
					if (!childParents.includes(String(newId))) {
						await ctx.db.patch(childId, {
							parents: [...childParents, String(newId)],
						});
					}
				}
			}

			// Establish bidirectional relationships: update parents to have this as child
			for (const parentIdStr of normalizedParents) {
				if (parentIdStr === String(rootProject._id)) continue; // Root handled separately above
				const parentId = parentIdStr as Id<"nodes">;
				const parent = await ctx.db.get(parentId);
				if (parent) {
					const parentChildren = parent.children ?? [];
					if (!parentChildren.includes(String(newId))) {
						await ctx.db.patch(parentId, {
							children: [...parentChildren, String(newId)],
						});
					}
				}
			}
		}

		return createdNodes.length;



	},
});

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
		function sortSiblingsByParentChildren<T extends { _id: unknown }>(
			parent: Doc<"nodes">,
			siblings: T[]
		): T[] {
			const childIds = Array.isArray(parent.children) ? parent.children : [];
			if (childIds.length === 0) return siblings.slice();

			// Build index map for O(1) position lookup
			const pos = new Map<Id<"nodes">, number>();
			for (let i = 0; i < childIds.length; i++) {
				pos.set(childIds[i] as Id<"nodes">, i);
			}

			return siblings
				.map((t, idx) => {
					const nodeId = (t as any)._id as Id<"nodes">;
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
	handler: async (_ctx, _args) => {
		throw new ConvexError({ type: "NotImplementedError", msg: "Convex.tasks.searchTasks" });
	},
});

export const exportData = query({
	args: { subtreeId: v.optional(v.string()) },
	handler: async (ctx, { subtreeId }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;


		const nodesResult = await ctx.db.query('nodes').withIndex('by_user', q => q.eq('userAuthId', userAuthId)).collect();

		const tasks = nodesResult.map(n => cleanNodeForClient(n));

		const exportedData: ExportedData = {
			version: "0.0.1",
			exportedAt: new Date().toISOString(),
			nodes: tasks,
		};

		return exportedData;

	}
})

//#endregion


//#region Utilities

/**
 * Gets or creates the root project for a user. Ensures exactly one root per user.
 * Root projects are hidden from clients and serve as the parent for all parentless tasks.
 */
// TODO:refactor This will eventually need to be removed,
// and instead error if a task is created without a parent
export async function getOrCreateProject(ctx: any, userAuthId: string): Promise<DBNode> {
	// Look for existing root project
	const existingRoots = await ctx.db
		.query("nodes")
		.withIndex("by_user_type", (q: any) => q.eq("userAuthId", userAuthId).eq("data.type", "project"))
		.collect();

	if (existingRoots.length === 1) {
		return existingRoots[0];
	} else if (existingRoots.length > 1) {
		// TODO: Consider cleanup migration if multiple roots found
		throw new ConvexError({ type: "NotImplementedError", msg: "Multiple root projects found for user" });
	} else {
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
}

/**
 * DEPRECATED: Legacy alias for getOrCreateProject
 * @deprecated Use getOrCreateProject instead
 */
export async function getOrCreateRoot(ctx: any, userAuthId: string): Promise<DBNode> {
	return getOrCreateProject(ctx, userAuthId);
}

/**
 * Normalizes a node's parents array according to root rules:
 * - If empty, attaches to root
 * - If multiple parents, removes root if present
 * Also updates root.children when node attaches/detaches from root.
 * @returns Normalized parents array
 */
async function normalizeTaskParents(
	ctx: MutationCtx,
	oldNode: DBNode,
	newParents: string[],
	nodeId: Id<"nodes">
): Promise<string[]> {
	// Root projects cannot have parents modified
	if (oldNode.data.type === "project") {
		return newParents;
	}

	const rootProject = await getOrCreateProject(ctx, oldNode.userAuthId);
	const rootId = String(rootProject._id);
	const wasAttachedToRoot = oldNode.parents?.includes(rootId);

	let normalizedParents: string[];

	// Normalize parents array
	if (newParents.length === 0) {
		// No parents - attach to root
		normalizedParents = [rootId];
	} else if (newParents.length > 1) {
		// Multiple parents - remove root if present
		normalizedParents = newParents.filter(id => id !== rootId);
	} else {
		// Single parent - keep as is
		normalizedParents = [...newParents];
	}

	const isAttachedToRoot = normalizedParents.includes(rootId);

	// Update root.children when attachment state changes
	if (!wasAttachedToRoot && isAttachedToRoot) {
		// Newly attached to root
		const rootChildren = [...(rootProject.children ?? [])];
		if (!rootChildren.includes(String(nodeId))) {
			rootChildren.push(String(nodeId));
			await ctx.db.patch(rootProject._id, {
				children: rootChildren,
			});
		}
	} else if (wasAttachedToRoot && !isAttachedToRoot) {
		// Detached from root
		const rootChildren = (rootProject.children ?? []).filter(id => id !== String(nodeId));
		await ctx.db.patch(rootProject._id, {
			children: rootChildren,
		});
	}

	return normalizedParents;
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
	const now = Date.now();

	// Apply each update
	for (const { taskId, operations } of updates) {
		const relatedNode = await ctx.db.get(taskId as Id<"nodes">);
		if (!relatedNode) throw new ConvexError({ type: "NotFoundError", msg: "Node not found", ctx: taskId });

		// Apply operations using shared logic
		const updated = applyRelationshipOperations(cleanNodeForClient(relatedNode), operations);

		// Normalize parents for affected nodes
		const normalizedParents = await normalizeTaskParents(
			ctx,
			relatedNode,
			updated.parents ?? [],
			taskId as Id<"nodes">
		);

		// Patch the DB with normalized parents
		await ctx.db.patch(relatedNode._id, {
			parents: normalizedParents,
			children: updated.children,
		});

		const refreshed = await ctx.db.get(relatedNode._id);
		if (refreshed) affectedNodes.push(refreshed);
	}

	// Deduplicate
	const seen = new Set<string>();
	return affectedNodes.filter(t => {
		const key = String(t._id);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function cleanNodeForClient(node: DBNode) {
	const t: ClientNode<any> = {
		...node,
		id: node._id,
		created: node.created ?? node._creationTime,
	};
	delete (t as any)._id;
	delete (t as any)._creationTime;

	return t;
}

//#endregion