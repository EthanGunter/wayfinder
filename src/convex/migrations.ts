import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { Err } from "$domain/errors";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();
export const runAll = migrations.runner([
	internal.migrations.addTaskCreatedAtColumn,
	internal.migrations.addTaskTypeField,
	internal.migrations.attachParentlessTasksToRoot
])

/**
 * 2025-11-11
 * Attaches parentless tasks to their user's root task.
 * This migration runs after addTaskTypeField to ensure all tasks have a type.
 */
export const attachParentlessTasksToRoot = migrations.define({
	table: "tasks",
	migrateOne: async (ctx, doc) => {
		// Only process tasks that have no parents
		if (doc.type !== "task" || doc.parents.length > 0) {
			return {}
		}

		// Get or create root for this user
		const existingRoots = await ctx.db
			.query("tasks")
			.withIndex("by_user_type", (q: any) => q.eq("userAuthId", doc.userAuthId).eq("type", "root"))
			.collect();
		const root = existingRoots[0];

		let rootId: string;
		if (existingRoots.length === 1) {
			rootId = String(root._id);
			// Add this task to root's children
			await ctx.db.patch(root._id, {
				children: [...root.children, doc._id]
			});
		} else if (existingRoots.length > 1) {
			Err.UNHANDLED("Multiple root tasks found for user");
		} else {
			// Create root task
			const now = Date.now();
			const newRootId = await ctx.db.insert("tasks", {
				userAuthId: doc.userAuthId,
				type: "root",
				title: "",
				status: 0,
				parents: [],
				children: [doc._id],
				lastEdit: now,
				created: now,
			});
			rootId = String(newRootId);
		}

		// Set this task's parents to the root
		return {
			parents: [rootId]
		}
	},
})

/** 2025-11-11
 * Introduces type field and defaults to "task" and moves away from isRoot abstraction
 */
export const addTaskTypeField = migrations.define({
	table: "tasks",
	migrateOne(ctx, doc) {
		// If type is missing, set it to "task"
		// Root tasks will be created by getOrCreateRoot and have type="root"
		if (!("type" in doc) || (doc as any).type === undefined) {
			return {
				type: "task" as const,
				isRoot: undefined
			}
		}
		return {}
	},
})


// 2025-11-10
export const addTaskCreatedAtColumn = migrations.define({
	table: "tasks",
	migrateOne(ctx, doc) {
		return {
			created: doc._creationTime
		}
	},
})



