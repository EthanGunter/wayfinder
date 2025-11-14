import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { Id, type DataModel } from "./_generated/dataModel";
import { Err } from "$domain/errors";
import { getOrCreateRoot } from "./tasks";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();
export const runAll = migrations.runner([
	internal.migrations.populateTaskCreatedAtColumn,
	internal.migrations.addProjectsAndNodeType,
])


/** 2025-11-11
 * Introduces type field and defaults to "task" and moves away from isRoot abstraction
 * by attaching parentless tasks to a projects-root node
 */
export const addProjectsAndNodeType = migrations.define({
	table: "tasks",
	migrateOne: async (ctx, doc) => {
		if (doc.type !== "root") {
			let attachToRoot: boolean = false;
			if (doc.parents.length === 0) {
				// Attach to projects-root
				attachToRoot = true;
			} else if (doc.parents.length === 1) {
				// If the parent doesn't exist, attach to projects-root
				const parent = await ctx.db.get(doc.parents[0] as Id<"tasks">);
				if (!parent) {
					attachToRoot = true;
				}
			}

			if (attachToRoot) {
				const root = await getOrCreateRoot(ctx, doc.userAuthId);
				// Add this task to the root's children
				await ctx.db.patch(root._id, { children: [...(root.children ?? []), doc._id] });
				// Add the root to this task's parents
				return {
					parents: [String(root._id)],
					type: "task" as const
				}
			}
		}
		return {}
	},
})

// 2025-11-10
export const populateTaskCreatedAtColumn = migrations.define({
	table: "tasks",
	migrateOne(ctx, doc) {
		return {
			created: doc._creationTime
		}
	},
})



