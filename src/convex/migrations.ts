import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { type Id, type DataModel, type Doc } from "./_generated/dataModel";
import { TaskData, TaskStatus } from "$domain/models/task";
import { ProjectStatus, type ProjectData } from "$domain/models/project";
import type { MutationCtx } from "./_generated/server";
import { _updateTask, _deleteTask, resolveProjectAncestor, validateParentsAndProject, propagateRelationshipChanges } from "./tasks";
import { ConvexError } from "convex/values";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();


// migrated Dev
// TODO:migration Preview
// TODO:migration Prod
export const promoteRootChildrenToProjects = migrations.define({
	table: "nodes",
	migrateOne: async (ctx, node) => {
		// Target only the hidden root project (untitled, no parents)
		if (node.data.type !== "project" || (node.data.title !== "Projects" && node.data.title !== "") || (node.parents.length ?? 0) > 0) return;

		const rootId = node._id;
		console.log("Promoting root children to projects:", node);

		const makeCtx = (userAuthId: string): MutationCtx =>
		({
			...ctx,
			auth: {
				getUserIdentity: async () => ({ subject: userAuthId }),
			},
		} as unknown as MutationCtx);

		for (const childId of node.children) {
			const child = await ctx.db.get(childId as Id<"nodes">);
			if (!child) continue;
			const parents = (child.parents).filter((p) => p !== rootId);

			console.log("Normalizing relationships for child:", child.data.title, "with parents:", parents);
			// Normalize relationships using existing update logic
			// await _updateTask(makeCtx(child.userAuthId), {
			// 	id: String(child._id),
			// 	parents,
			// });

			// Build patch object with proper nested structure
			const patchData: Partial<Doc<'nodes'>> = {
				parents,
			};
			// Promote to project if needed
			if (child.data.type !== "project") {
				patchData.data = { // Explicitly set to avoid including task-only data
					title: child.data.title ?? "",
					content: child.data.content,
					type: "project",
					status: ProjectStatus.active,
				};
			}

			// Apply patch
			await ctx.db.patch(child._id, patchData);

			// Get updated node
			const updated = await ctx.db.get(child._id);
			if (!updated) throw new ConvexError({ type: "NotFoundError", msg: "Failed to retrieve updated node", ctx: child._id });

			// Propagate relationship changes
			await propagateRelationshipChanges(ctx, [
				{ oldTask: child, newTask: updated }
			]);

		}

		// Remove the root node itself (uses shared deletion logic)
		await _deleteTask(makeCtx(node.userAuthId), rootId as Id<"nodes">);
	},
});

// migrated dev
// migration Preview
// TODO:migration Prod
export const fixSelfReferencingProjects = migrations.define({
	table: "nodes",
	migrateOne: async (ctx, node) => {
		if (node.data.type === "project" && (node.parents.length > 0 && node.parents[0] === node._id)) {
			// Remove the self-referencing parent
			return {
				parents: node.parents.filter((p) => p !== node._id) ?? [],
				children: node.children.filter((c) => c !== node._id) ?? []
			}
		} else {
			ctx = {
				...ctx,
				auth: {
					getUserIdentity: async () => ({ subject: node.userAuthId }),
				},
			} as unknown as MutationCtx;
			const project = await resolveProjectAncestor(ctx, node._id, node.userAuthId);
			if (node.parents.includes(project._id)) {
				// Ensure the relationship is bidirectionally consistent
				await _updateTask(ctx, { id: project._id, addChildren: [node._id] });
			}
		}
	},
});

// migrated Dev
// TODO:migration Preview
// TODO:migration Prod
export const reorderCompletedChildren = migrations.define({
	table: "nodes",
	migrateOne: async (ctx, node) => {
		if (!node.children || node.children.length <= 1) return;

		const childrenDocs = await Promise.all(
			node.children.map((id) => ctx.db.get(id as Id<"nodes">))
		);

		const validChildren = childrenDocs.filter((n): n is Doc<"nodes"> => !!n);

		// If we have missing children, skip reordering to avoid data loss
		if (validChildren.length !== node.children.length) return;

		const incomplete: string[] = [];
		const complete: string[] = [];

		for (const child of validChildren) {
			if (child.data.type === "task" && child.data.status === TaskStatus.complete) {
				complete.push(child._id);
			} else {
				incomplete.push(child._id);
			}
		}

		const newChildren = [...incomplete, ...complete];

		// Check if changed
		const isChanged = newChildren.some((id, i) => id !== node.children![i]);

		if (isChanged) {
			await ctx.db.patch(node._id, { children: newChildren });
		}
	},
});
