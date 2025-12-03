/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { type Id, type DataModel, type Doc } from "./_generated/dataModel";
import { TaskStatus } from "$domain/models/task";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();


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
