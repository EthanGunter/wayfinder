import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { type DataModel } from "./_generated/dataModel";
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
		// 1) Ensure every task has a type (default to "task")
		let nextType = doc.type;
		if (!nextType) {
			nextType = "task";
		} else if (nextType !== "task" && nextType !== "root") {
			Err.UNHANDLED("Invalid task type");
		}

		// Prepare a patch accumulator
		const patch: any = {};
		if (nextType !== doc.type) {
			patch.type = nextType;
		}

		// 2) Only attach parentless "task" docs under a root
		if (nextType === "task" && (!doc.parents || doc.parents.length === 0)) {
			// Get or create root for this user
			const existingRoots = await ctx.db
				.query("tasks")
				.withIndex("by_user_type", (q: any) =>
					q.eq("userAuthId", doc.userAuthId).eq("type", "root")
				)
				.collect();

			if (existingRoots.length > 1) {
				Err.UNHANDLED("Multiple root tasks found for user");
			}

			let rootId: string;
			let root: any = existingRoots[0];

			if (existingRoots.length === 1) {
				rootId = String(root._id);

				// Ensure the found root truly is type "root"
				if (root.type !== "root") {
					await ctx.db.patch(root._id, { type: "root" });
					root = { ...root, type: "root" };
				}

				// Add this task to root's children if not already present
				const children = Array.isArray(root.children) ? root.children : [];
				if (!children.some((id: any) => String(id) === String(doc._id))) {
					await ctx.db.patch(root._id, {
						children: [...children, doc._id],
					});
				}
			} else {
				// Create root task
				const now = Date.now();
				const newRootId = await ctx.db.insert("tasks", {
					userAuthId: doc.userAuthId,
					type: "root",
					title: "Projects",
					status: 0,
					parents: [],
					children: [doc._id],
					lastEdit: now,
					created: now,
				});
				rootId = String(newRootId);
			}

			// Set this task's parents to the root
			patch.parents = [rootId];
		}

		// If nothing to change, return empty object
		if (Object.keys(patch).length === 0) return {};

		return patch;
	},
});

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



