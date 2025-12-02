/* eslint-disable @typescript-eslint/no-explicit-any */
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { type Id, type DataModel } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();

/** 2025-11-20
 * Migrates from unified tasks table to nodes table with embedded discriminated union data.
 * This is a one-time mutation (not using migration framework) to handle the complex
 * ID mapping required when moving from tasks to nodes table.
 * 
 * Migration Strategy:
 * 1. Read all tasks from tasks table
 * 2. Create corresponding nodes in nodes table with transformed structure
 * 3. Build a mapping of old task IDs to new node IDs
 * 4. Update all parent/child references to use new node IDs
 * 5. Converts "root" type to "project" nodes
 * 
 * IMPORTANT: Run this once, then verify data before removing tasks table from schema
 */
export const migrateTasksToNodesCustom = mutation({
	args: {},
	handler: async (ctx) => {
		// Check if migration has already been run
		const existingNodes = await ctx.db.query("nodes").first();
		if (existingNodes) {
			return {
				success: false,
				message: "Migration already run - nodes table is not empty",
				migrated: 0,
			};
		}

		// Phase 1: Read all tasks and create nodes without relationships
		const allTasks = await ctx.db.query("tasks").collect();
		const idMapping = new Map<string, Id<"nodes">>(); // old task ID -> new node ID

		console.log(`Starting migration of ${allTasks.length} tasks to nodes...`);

		// Phase 2: Create all nodes with temporary empty relationships
		for (const task of allTasks) {
			// Build the data object based on type
			let data: any;

			if (task.type === "root") {
				// Convert root to project
				data = {
					type: "project" as const,
					title: task.title || "Default Project",
					content: task.content,
					status: task.status ?? 0,
					dueDate: task.dueDate,
				};
			} else {
				// Regular task
				data = {
					type: "task" as const,
					title: task.title,
					content: task.content,
					status: task.status ?? 0,
					todaysTask: task.todaysTask,
					dueDate: task.dueDate,
				};
			}

			// Create node with empty relationships (will fix in phase 3)
			const newNodeId = await ctx.db.insert("nodes", {
				userAuthId: task.userAuthId,
				parents: [],
				children: [],
				lastEdit: task.lastEdit ?? task._creationTime,
				created: task.created ?? task._creationTime,
				data,
			});

			// Store the mapping
			idMapping.set(String(task._id), newNodeId);
		}

		// Phase 3: Update all parent/child relationships with new IDs
		let relationshipsUpdated = 0;
		for (const task of allTasks) {
			const newNodeId = idMapping.get(String(task._id));
			if (!newNodeId) continue;

			// Map old parent IDs to new node IDs
			const newParents: string[] = [];
			for (const oldParentId of task.parents ?? []) {
				const newParentId = idMapping.get(oldParentId);
				if (newParentId) {
					newParents.push(String(newParentId));
				} else {
					console.warn(`Parent ${oldParentId} not found in mapping for task ${task._id}`);
				}
			}

			// Map old child IDs to new node IDs
			const newChildren: string[] = [];
			for (const oldChildId of task.children ?? []) {
				const newChildId = idMapping.get(oldChildId);
				if (newChildId) {
					newChildren.push(String(newChildId));
				} else {
					console.warn(`Child ${oldChildId} not found in mapping for task ${task._id}`);
				}
			}

			// Update the node with correct relationships
			await ctx.db.patch(newNodeId, {
				parents: newParents,
				children: newChildren,
			});
			relationshipsUpdated++;
		}

		console.log(`Migration complete: ${allTasks.length} nodes created, ${relationshipsUpdated} relationships updated`);

		return {
			success: true,
			message: "Migration completed successfully",
			migrated: allTasks.length,
			relationshipsUpdated,
		};
	},
});



