import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const UserStatusDef = v.union(v.literal("active"), v.literal("deleted"));
export const UserFeatureDef = v.array(v.union(v.literal("dev"), v.literal("no-task-limit"), v.literal("import-export")));

export const UserDef = {
  authId: v.string(), // external user id from BetterAuth
  displayName: v.string(),
  avatarUrl: v.optional(v.string()),
  status: UserStatusDef,
  features: UserFeatureDef,
  settingOverrides: v.optional(v.any()),
}


export const ProjectDataDef = v.object({
  type: v.literal('project'),
  title: v.string(),
  content: v.optional(v.string()),
  status: v.number(), // keep your numeric enum as-is
  dueDate: v.optional(v.number()),
})
export const TaskDataDef = v.object({
  type: v.literal('task'),
  title: v.string(),
  content: v.optional(v.string()),
  status: v.number(), // keep your numeric enum as-is
  todaysTask: v.optional(v.number()), // unix milliseconds or undefined
  dueDate: v.optional(v.number()),
})

export const NodeDataDef = v.union(ProjectDataDef, TaskDataDef);

export const NodeDef = {
  userAuthId: v.string(), // foreign key to users.authId
  parents: v.array(v.string()),  // store task ids as strings
  children: v.array(v.string()),
  lastEdit: v.number(),  // unix milliseconds
  created: v.number(),  // unix milliseconds
  data: NodeDataDef,
}

// DEPRECATED: Old tasks table structure - kept temporarily for migration
// TODO: Remove after migrateTasksToNodes migration completes in production
export const TaskNodeDef_DEPRECATED = {
  userAuthId: v.string(),
  type: v.union(v.literal("task"), v.literal("root")),
  parents: v.array(v.string()),
  children: v.array(v.string()),
  title: v.string(),
  content: v.optional(v.string()),
  status: v.number(),
  todaysTask: v.optional(v.number()),
  dueDate: v.optional(v.number()),
  lastEdit: v.number(),
  created: v.number(),
}

export default defineSchema({
  users: defineTable(
    UserDef
  ).index("by_authId", ["authId"])
   .index("by_status", ["status"]),
  nodes: defineTable(NodeDef)
    .index("by_user", ["userAuthId"])
    .index("by_user_type", ["userAuthId", "data.type"])
    .index("by_users_daily_tasks", ["userAuthId", "data.todaysTask"]),
  // DEPRECATED: Remove after migration completes
  tasks: defineTable(TaskNodeDef_DEPRECATED)
    .index("by_user", ["userAuthId"])
    .index("by_user_type", ["userAuthId", "type"])
    .index("by_todays_task", ["userAuthId", "todaysTask"]),
});