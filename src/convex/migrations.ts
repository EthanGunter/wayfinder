import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();
export const runAll = migrations.runner([
	internal.migrations.addTaskCreatedAtColumn
])

// 2025-11-11
export const addTaskCreatedAtColumn = migrations.define({
	table: "tasks",
	migrateOne(ctx, doc) {
		return {
			created: doc._creationTime
		}
	},
})