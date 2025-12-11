import { ArgumentError } from "$domain/errors";
import type { Doc, Id } from "./_generated/dataModel";
import { query, mutation, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { applyRelationshipOperations, calculateRelationshipUpdates, EXPORT_VERSIONS, TaskStatus } from "$domain/models/task";
import type { CreateTaskParams, ExportedData, TaskData, UpdateTaskParams } from "$domain/models/task";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { AppData as AppData, IAppNode } from "$domain/models/node";
import type { ProjectData, UpdateProjectParams } from "$domain/models/project";

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
		throw new ConvexError({ type: "InvalidState", msg: "Project cannot have parents modified", ctx: update.id });
	}

	const now = Date.now();

	// Resolve relations operations into arrays
	// Initialize with static set. If no update is provided, 
	// use the old node's relations and prepare for deltas
	let parents = [...(update.parents ?? oldNode.parents ?? [])];
	let children = [...(update.children ?? oldNode.children ?? [])];

	if (update.addParents) {
		parents = Array.from(new Set([...parents, ...update.addParents]));
	}

	if (update.removeParents) {
		if (parents.length === 1 && oldNode.data.type !== "project") {
			const project = await resolveProjectAncestor(ctx, parents[0], oldNode.userAuthId);
			parents = [project._id];
		}
		parents = parents.filter(id => !update.removeParents!.includes(id));
	}

	if (update.addChildren) {
		children = Array.from(new Set([...children, ...update.addChildren]));
	}

	if (update.removeChildren) {
		children = children.filter(id => !update.removeChildren!.includes(id));
	}

	// Only validate tasks for now. Generic validation will be handled after the refactor
	if (oldNode.data.type === "task") {
		// Validate parents using shared function (must remain non-empty and share project ancestor)
		console.log("Validating parents for task:", oldNode.data.title, "with parents:", parents, "and children:", children, "of node:", oldNode._id);
		const { parents: normalizedParents } = await validateParentsAndProject(ctx, parents, oldNode.userAuthId);
		parents = normalizedParents;
	}

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

		// Determine target project based on projectId parameter
		let projectsInData: IAppNode<AppData<number>, number>[] = [];
		let tasksToImport: IAppNode<AppData<number>, number>[] = [];
		// Preserve projects from data OR throw error if orphaned tasks
		projectsInData = dataToImport.filter(node => node.data.type === "project");
		tasksToImport = dataToImport.filter(node => node.data.type === "task");

		if (projectsInData.length === 0) {
			// No projects in data - check if any tasks have no parents (orphaned)
			const hasOrphanedTasks = tasksToImport.some(task => (task.parents ?? []).length === 0);
			if (hasOrphanedTasks) {
				throw new ConvexError({
					type: "InvalidState",
					msg: "Cannot import orphaned tasks without a project. Provide projectId parameter or include project in export data."
				});
			}
		}


	// Filter out references to nodes not in the import set
	const allImportIds = new Set(dataToImport.map(t => t.id!));
	for (const task of tasksToImport) {
		task.parents = task.parents?.filter(p => allImportIds.has(p)) ?? [];
		task.children = task.children?.filter(c => allImportIds.has(c)) ?? [];
	}
	for (const project of projectsInData) {
		project.parents = []; // Projects should never have parents
		project.children = project.children?.filter(c => allImportIds.has(c)) ?? [];
	}

	if (mode === "replace") {
		// Get all existing nodes and delete them directly (no propagation needed since we're replacing everything)
		const existingNodes = await ctx.db
			.query("nodes")
			.withIndex("by_user", (q) => q.eq("userAuthId", userAuthId))
			.collect();
		
		// Delete all at once - no need for propagation since we're recreating everything
		for (const node of existingNodes) {
			await ctx.db.delete(node._id);
		}
	}

		// Create all nodes with their original relationships (old IDs)
		// Build mapping: oldId -> newId
		const idMapping = new Map<string, Id<"nodes">>();
		const createdNodes: Array<{ oldId: string; newId: Id<"nodes">; node: DBNode }> = [];

		// First, handle projects if not using projectId parameter
		for (const projectNode of projectsInData) {
			const oldId = projectNode.id!;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (projectNode as any).id;

			const newId = await ctx.db.insert("nodes", projectNode);
			const createdNode = await ctx.db.get(newId);
			if (!createdNode) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created project", ctx: newId });

			createdNodes.push({ oldId, newId, node: createdNode });
			idMapping.set(oldId, newId);
		}

		// Then, handle tasks
		for (const createDetail of tasksToImport) {
			const oldId = createDetail.id!;
			// Create new ids for every imported node so we don't import bad references
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (createDetail as any).id;

			// Create node with original relationships (old IDs)
			// Don't normalize parents - we'll handle that after remapping
			const newId = await ctx.db.insert("nodes", createDetail);
			const createdNode = await ctx.db.get(newId);
			if (!createdNode) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created node", ctx: newId });
			createdNodes.push({ oldId, newId, node: createdNode });

			idMapping.set(oldId, newId);
		}

		// Remap relationships and establish bidirectional consistency
		// For each node: remap old IDs to new IDs, normalize parents, and update related nodes
		for (const { newId, node } of createdNodes) {
			// Remap old IDs to new IDs
			const remappedParents = (node.parents ?? []).map(oldId => idMapping.get(oldId)).filter((id): id is Id<"nodes"> => !!id).map(String);
			const remappedChildren = (node.children ?? []).map(oldId => idMapping.get(oldId)).filter((id): id is Id<"nodes"> => !!id).map(String);

			// Normalize parents based on whether we're using projectId parameter
			let normalizedParents: string[];

			// Projects should have no parents, tasks follow normal rules
			if (node.data.type === "project") {
				normalizedParents = [];
			} else if (remappedParents.length === 0) {
				throw new ConvexError({
					type: "InvalidState",
					msg: "Task has no valid parents after remapping",
					ctx: newId
				});
			} else {
				normalizedParents = remappedParents;
			}


			// Update this node with remapped relationships
			await ctx.db.patch(newId, {
				parents: normalizedParents,
				children: remappedChildren,
			});


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

		// 2-a) Handle orphaned tasks
		const parentIds = self.parents ?? [];
		if (parentIds.length === 0) {
			throw new ConvexError({
				type: "InvalidState",
				msg: "Task has no parents - orphaned task detected",
				ctx: id
			});
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


export const createProject = mutation({
	args: {
		title: v.string(),
		content: v.optional(v.string()),
		status: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		uiPrefs: v.optional(v.object({
			showStreak: v.optional(v.boolean()),
			showVelocity: v.optional(v.boolean()),
			showMomentumScore: v.optional(v.boolean()),
			showNextAction: v.optional(v.boolean()),
			showMicroWins: v.optional(v.boolean()),
		})),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Failed to get identity from ctx" });
		}
		const userAuthId = identity.subject;

		// Get user settings to apply defaults
		const user = await ctx.db.query("users").withIndex("by_authId", (q) => q.eq("authId", userAuthId)).unique();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const settingOverrides = user?.settingOverrides as Record<string, any> | undefined;

		// Extract default project settings from user settings
		const defaults = settingOverrides?.projects?.defaults || {};
		const defaultUiPrefs = {
			showStreak: defaults.defaultProjectShowStreak ?? false,
			showVelocity: defaults.defaultProjectShowVelocity ?? false,
			showMomentumScore: defaults.defaultProjectShowMomentumScore ?? true,
			showNextAction: defaults.defaultProjectShowNextAction ?? true,
			showMicroWins: defaults.defaultProjectShowMicroWins ?? false,
		};

		// Merge provided uiPrefs with defaults
		const uiPrefs = args.uiPrefs ? { ...defaultUiPrefs, ...args.uiPrefs } : defaultUiPrefs;

		const now = Date.now();
		const projectId = await ctx.db.insert("nodes", {
			userAuthId,
			parents: [], // Projects are top-level with no parents
			children: [],
			lastEdit: now,
			created: now,
			data: {
				type: "project" as const,
				title: args.title,
				content: args.content,
				status: args.status ?? 0, // active by default
				dueDate: args.dueDate,
				uiPrefs,
			},
		});

		const created = await ctx.db.get(projectId);
		if (!created) {
			throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve created project", ctx: projectId });
		}

		return cleanNodeForClient(created);
	},
});

export const updateProject = mutation({
	args: {
		id: v.string(),
		children: v.optional(v.array(v.string())),
		addChildren: v.optional(v.array(v.string())),
		removeChildren: v.optional(v.array(v.string())),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		status: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		uiPrefs: v.optional(v.object({
			showStreak: v.optional(v.boolean()),
			showVelocity: v.optional(v.boolean()),
			showMomentumScore: v.optional(v.boolean()),
			showNextAction: v.optional(v.boolean()),
			showMicroWins: v.optional(v.boolean()),
		})),
		lastEdit: v.optional(v.number()),
	},
	handler: async (ctx, update) => {
		const projectId = update.id as Id<"nodes">;

		// Get old project state
		const oldProject = await ctx.db.get(projectId);
		if (!oldProject) throw new ConvexError({ type: "NotFoundError", msg: "Project not found", ctx: update.id });
		if (oldProject.data.type !== "project") {
			throw new ConvexError({ type: "InvalidState", msg: "Node is not a project", ctx: update.id });
		}

		// Authorize ownership
		const identity = await ctx.auth.getUserIdentity();
		if (!identity || identity.subject !== oldProject.userAuthId) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Not owner of project", ctx: update.id });
		}

		const now = Date.now();

		// Resolve children operations into arrays
		let children = [...(update.children ?? oldProject.children ?? [])];

		if (update.addChildren) {
			children = Array.from(new Set([...children, ...update.addChildren]));
		}

		if (update.removeChildren) {
			children = children.filter(id => !update.removeChildren!.includes(id));
		}

		// Build patch object
		const patchData: Partial<DBNode> = {
			children,
			lastEdit: update.lastEdit ?? now,
		};

		// Handle nested data updates for ProjectData fields
		const dataUpdates: Partial<ProjectData<number>> = {};
		if (update.title !== undefined) dataUpdates.title = update.title;
		if (update.content !== undefined) dataUpdates.content = update.content;
		if (update.status !== undefined) dataUpdates.status = update.status;
		if (update.dueDate !== undefined) dataUpdates.dueDate = update.dueDate;
		if (update.uiPrefs !== undefined) {
			// Merge uiPrefs with existing values
			dataUpdates.uiPrefs = {
				...oldProject.data.uiPrefs,
				...update.uiPrefs,
			};
		}

		// Merge data updates with existing data
		if (Object.keys(dataUpdates).length > 0) {
			patchData.data = {
				...oldProject.data,
				...dataUpdates,
			};
		}

		// Apply patch
		await ctx.db.patch(projectId, patchData);

		// Get updated node
		const updated = await ctx.db.get(projectId);
		if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated project", ctx: projectId });

		// Propagate relationship changes to affected children
		const affected = await propagateRelationshipChanges(ctx, [
			{ oldTask: oldProject, newTask: updated }
		]);

		return {
			updated: cleanNodeForClient(updated),
			affected: affected.map(cleanNodeForClient)
		};
	},
});

export const getProjects = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return []; // TODO:UX/DX Log and error
		const projects = await ctx.db.query("nodes").withIndex("by_user_type", (q) => q.eq("userAuthId", identity.subject).eq("data.type", "project")).collect();

		// Calculate metrics for each project
		const projectsWithMetrics = await Promise.all(
			projects.map(async (project) => {
				const metrics = await calculateProjectMetrics(ctx, project._id);
				return {
					...cleanNodeForClient(project),
					metrics,
				};
			})
		);

		return projectsWithMetrics;
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
	args: { projectId: v.string(), limit: v.number() },
	handler: async (ctx, { projectId, limit }) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new ConvexError({ type: "NotAuthorizedError", msg: "Auth Identity not found" });

		// Get the specified project
		const project = await ctx.db.get(projectId as Id<"nodes">);
		if (!project) {
			throw new ConvexError({ type: "NotFoundError", msg: "Project not found", ctx: projectId });
		}
		if (project.userAuthId !== identity.subject) {
			throw new ConvexError({ type: "NotAuthorizedError", msg: "Project belongs to another user", ctx: projectId });
		}
		if (project.data.type !== "project") {
			throw new ConvexError({ type: "InvalidState", msg: "Node is not a project", ctx: projectId });
		}

		// Get all user nodes to build the subtree
		const nodes = await ctx.db
			.query("nodes")
			.withIndex("by_user", (q) => q.eq("userAuthId", identity.subject))
			.collect();

		// Filter to only tasks
		const taskNodes = nodes.filter(n => n.data.type === "task");
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
		// Start from the project's children
		const projectChildren = (project.children ?? []).map(id => nodesMap.get(id)).filter((n): n is DBNode => !!n).sort(sorter);
		for (const r of projectChildren) {
			if (todo.length === limit) break;
			walk(r);
		}
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


//#region Project Metrics

interface Activity {
	timestamp: number;
	type: "completion" | "creation" | "edit";
}

interface ProjectMetrics {
	progress: {
		total: number;
		completed: number;
		percentage: number;
	};
	streak?: {
		days: number;
		lastActive?: string;
	};
	velocity?: number; // tasks per week
	momentumScore?: number; // 0-100
	nextAction?: {
		id: string;
		title: string;
	};
	microWins?: number; // tasks completed in last 7 days
	smartTimestamp?: string;
}

/**
 * Get meaningful activity for a project (task completions, creations, significant edits)
 */
async function getProjectActivity(ctx: QueryCtx, projectId: Id<"nodes">): Promise<Activity[]> {
	const activities: Activity[] = [];

	// Get project to find user
	const project = await ctx.db.get(projectId);
	if (!project) return activities;

	// Get all user nodes to build subtree
	const allNodes = await ctx.db.query("nodes").withIndex("by_user", (q) => q.eq("userAuthId", project.userAuthId)).collect();
	const nodeMap = new Map<string, DBNode>(allNodes.map((n) => [n._id, n]));

	// Traverse subtree to collect all tasks
	const visited = new Set<string>();
	const queue: string[] = [projectId];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		if (visited.has(currentId)) continue;
		visited.add(currentId);

		const node = nodeMap.get(currentId);
		if (!node) continue;

		// Only track tasks, not projects
		if (node.data.type === "task") {
			// Track creation
			if (node.created) {
				activities.push({
					timestamp: node.created,
					type: "creation",
				});
			}

			// Track completion (if status changed to complete, use lastEdit as proxy)
			if (node.data.status === TaskStatus.complete && node.lastEdit) {
				activities.push({
					timestamp: node.lastEdit,
					type: "completion",
				});
			}

			// Track significant edits (content changes, title changes)
			// Use lastEdit as proxy for meaningful changes
			if (node.lastEdit && node.lastEdit !== node.created) {
				activities.push({
					timestamp: node.lastEdit,
					type: "edit",
				});
			}
		}

		// Continue traversal
		for (const childId of node.children ?? []) {
			if (!visited.has(childId)) queue.push(childId);
		}
	}

	// Sort by timestamp descending
	activities.sort((a, b) => b.timestamp - a.timestamp);

	return activities;
}

/**
 * Calculate streak - consecutive days with activity
 */
function calculateStreak(activities: Activity[]): { days: number; lastActive?: string } {
	if (activities.length === 0) {
		return { days: 0, lastActive: "Never" };
	}

	const now = Date.now();
	const oneDay = 24 * 60 * 60 * 1000;

	// Get unique days with activity
	const activityDays = new Set<number>();
	for (const activity of activities) {
		const day = Math.floor(activity.timestamp / oneDay);
		activityDays.add(day);
	}

	const sortedDays = Array.from(activityDays).sort((a, b) => b - a);
	const today = Math.floor(now / oneDay);

	// Check consecutive days starting from today or most recent
	let streak = 0;
	let expectedDay = sortedDays[0]; // Most recent day

	for (const day of sortedDays) {
		if (day === expectedDay) {
			streak++;
			expectedDay--;
		} else {
			break;
		}
	}

	// If most recent activity is not today, calculate days ago
	const lastActiveDay = sortedDays[0];
	const daysAgo = today - lastActiveDay;

	if (daysAgo > 0) {
		return {
			days: streak,
			lastActive: daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`,
		};
	}

	return { days: streak };
}

/**
 * Calculate velocity - tasks completed per week over rolling 4-week window
 */
function calculateVelocity(activities: Activity[]): number {
	const completions = activities.filter(a => a.type === "completion");
	if (completions.length === 0) return 0;

	const now = Date.now();
	const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000;
	const cutoff = now - fourWeeks;

	// Count completions in last 4 weeks
	const recentCompletions = completions.filter(c => c.timestamp >= cutoff);

	// Calculate tasks per week
	return (recentCompletions.length / 4);
}

/**
 * Calculate momentum score - composite 0-100 score weighing recency, frequency, consistency
 */
function calculateMomentumScore(activities: Activity[]): number {
	if (activities.length === 0) return 0;

	const now = Date.now();
	const oneDay = 24 * 60 * 60 * 1000;
	const oneWeek = 7 * 24 * 60 * 60 * 1000;
	const twoWeeks = 2 * oneWeek;
	const fourWeeks = 4 * oneWeek;

	// Recency score (0-40): How recent is the last activity?
	const lastActivity = activities[0];
	const daysSinceLastActivity = (now - lastActivity.timestamp) / oneDay;
	const recencyScore = Math.max(0, 40 * (1 - daysSinceLastActivity / 7)); // Decay over 7 days

	// Frequency score (0-30): How many activities in last 2 weeks?
	const recentActivities = activities.filter(a => a.timestamp >= now - twoWeeks);
	const frequencyScore = Math.min(30, recentActivities.length * 2); // 2 points per activity, max 30

	// Consistency score (0-30): How consistent is activity over last 4 weeks?
	const fourWeekActivities = activities.filter(a => a.timestamp >= now - fourWeeks);
	const weeks = 4;
	const activitiesPerWeek = fourWeekActivities.length / weeks;
	const consistencyScore = Math.min(30, activitiesPerWeek * 5); // 5 points per activity per week, max 30

	return Math.round(recencyScore + frequencyScore + consistencyScore);
}

/**
 * Calculate progress - total tasks, completed tasks, percentage
 */
async function calculateProgress(ctx: QueryCtx, projectId: Id<"nodes">): Promise<{ total: number; completed: number; percentage: number }> {
	const project = await ctx.db.get(projectId);
	if (!project) return { total: 0, completed: 0, percentage: 0 };

	const allUserNodes = await ctx.db.query("nodes").withIndex("by_user", (q) => q.eq("userAuthId", project.userAuthId)).collect();
	const nodeMap = new Map<string, DBNode>(allUserNodes.map((n) => [n._id, n]));

	// Traverse subtree
	const visited = new Set<string>();
	const queue: string[] = [projectId];
	const tasks: DBNode[] = [];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		if (visited.has(currentId)) continue;
		visited.add(currentId);

		const node = nodeMap.get(currentId);
		if (!node) continue;

		if (node.data.type === "task") {
			tasks.push(node);
		}

		for (const childId of node.children ?? []) {
			if (!visited.has(childId)) queue.push(childId);
		}
	}

	const total = tasks.length;
	const completed = tasks.filter(t => t.data.status === TaskStatus.complete).length;
	const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

	return { total, completed, percentage };
}

/**
 * Get next action - first incomplete task, depth-first
 */
async function getNextAction(ctx: QueryCtx, projectId: Id<"nodes">): Promise<{ id: string; title: string } | undefined> {
	const project = await ctx.db.get(projectId);
	if (!project) return undefined;

	const allUserNodes = await ctx.db.query("nodes").withIndex("by_user", (q) => q.eq("userAuthId", project.userAuthId)).collect();
	const nodeMap = new Map<string, DBNode>(allUserNodes.map((n) => [n._id, n]));

	// Depth-first search for first incomplete task
	const visited = new Set<string>();

	function findFirstIncomplete(nodeId: string): DBNode | null {
		if (visited.has(nodeId)) return null;
		visited.add(nodeId);

		const node = nodeMap.get(nodeId);
		if (!node) return null;

		// If it's a task and incomplete, return it
		if (node.data.type === "task" && node.data.status !== TaskStatus.complete) {
			return node;
		}

		// Otherwise, check children depth-first
		for (const childId of node.children ?? []) {
			const result = findFirstIncomplete(childId);
			if (result) return result;
		}

		return null;
	}

	const next = findFirstIncomplete(projectId);
	if (next) {
		return {
			id: next._id,
			title: next.data.title,
		};
	}

	return undefined;
}

/**
 * Get micro wins - count tasks completed in last 7 days
 */
async function getMicroWins(ctx: QueryCtx, projectId: Id<"nodes">): Promise<number> {
	const activities = await getProjectActivity(ctx, projectId);
	const now = Date.now();
	const sevenDays = 7 * 24 * 60 * 60 * 1000;
	const cutoff = now - sevenDays;

	const recentCompletions = activities.filter(a => a.type === "completion" && a.timestamp >= cutoff);
	return recentCompletions.length;
}

/**
 * Get smart timestamp - "2h ago - completed 2 tasks" format
 */
async function getSmartTimestamp(ctx: QueryCtx, projectId: Id<"nodes">): Promise<string> {
	const project = await ctx.db.get(projectId);
	if (!project) return "";

	const lastEdit = project.lastEdit;
	if (!lastEdit) return "";

	const now = Date.now();
	const diff = now - lastEdit;
	const oneDay = 24 * 60 * 60 * 1000;

	const minutes = Math.floor(diff / (60 * 1000));
	const hours = Math.floor(diff / (60 * 60 * 1000));
	const days = Math.floor(diff / oneDay);

	let timeAgo: string;
	if (minutes < 60) {
		timeAgo = minutes <= 1 ? "just now" : `${minutes}m ago`;
	} else if (hours < 24) {
		timeAgo = hours === 1 ? "1h ago" : `${hours}h ago`;
	} else {
		timeAgo = days === 1 ? "1 day ago" : `${days} days ago`;
	}

	// Get recent completions for context
	const activities = await getProjectActivity(ctx, projectId);
	const recentCompletions = activities.filter(a => a.type === "completion" && a.timestamp >= now - oneDay);

	if (recentCompletions.length > 0) {
		return `${timeAgo} - completed ${recentCompletions.length} ${recentCompletions.length === 1 ? "task" : "tasks"}`;
	}

	return timeAgo;
}

/**
 * Calculate all metrics for a project
 */
async function calculateProjectMetrics(ctx: QueryCtx, projectId: Id<"nodes">): Promise<ProjectMetrics> {
	const activities = await getProjectActivity(ctx, projectId);
	const progress = await calculateProgress(ctx, projectId);
	const streak = calculateStreak(activities);
	const velocity = calculateVelocity(activities);
	const momentumScore = calculateMomentumScore(activities);
	const nextAction = await getNextAction(ctx, projectId);
	const microWins = await getMicroWins(ctx, projectId);
	const smartTimestamp = await getSmartTimestamp(ctx, projectId);

	return {
		progress,
		streak,
		velocity,
		momentumScore,
		nextAction,
		microWins,
		smartTimestamp,
	};
}

// TODO: Milestone support - allow users to mark tasks as milestones
// and show milestone progress (e.g., "2/5 milestones completed")

// TODO: Time estimate tracking - per-task time estimates that aggregate
// up to project level for "estimated time remaining" calculations

//#endregion


//#region Utilities


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

export async function resolveProjectAncestor(
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

export async function validateParentsAndProject(
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

export async function propagateRelationshipChanges(
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