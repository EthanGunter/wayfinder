import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { type Id, type DataModel, type Doc } from "./_generated/dataModel";
import { TaskStatus } from "$domain/models/task";
import { ProjectStatus, type ProjectData } from "$domain/models/project";
import type { MutationCtx } from "./_generated/server";
import { _updateTask, _deleteTask } from "./tasks";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();


// TODO:migration Dev
// TODO:migration Preview
// TODO:migration Prod
export const promoteRootChildrenToProjects = migrations.define({
	table: "nodes",
	migrateOne: async (ctx, node) => {
		// Target only the hidden root project (untitled, no parents)
		const title = typeof node.data.title === "string" ? node.data.title.trim() : "";
		if (node.data.type !== "project" || title !== "" || (node.parents?.length ?? 0) > 0) { return; }

		const rootId = node._id;
		const children = node.children ?? [];

		const makeCtx = (userAuthId: string): MutationCtx =>
			({
				...ctx,
				auth: {
					getUserIdentity: async () => ({ subject: userAuthId }),
				},
			} as unknown as MutationCtx);

		for (const childId of children) {
			const child = await ctx.db.get(childId as Id<"nodes">);
			if (!child) continue;
			const parents = (child.parents ?? []).filter((p) => p !== rootId);
			
			// Normalize relationships using existing update logic
			await _updateTask(makeCtx(child.userAuthId), {
				id: String(child._id),
				parents,
			});

			// Promote to project if needed
			if (child.data.type !== "project") {
				const promoted: ProjectData<number> = {
					type: "project",
					title: child.data.title ?? "",
					content: (child.data as { content?: string }).content,
					status: ProjectStatus.active,
					dueDate: (child.data as { dueDate?: number }).dueDate,
				};
				await ctx.db.patch(child._id, { data: promoted as Doc<"nodes">["data"] });
			}
		}

		// Remove the root node itself (uses shared deletion logic)
		await _deleteTask(makeCtx(node.userAuthId), rootId as Id<"nodes">);
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
