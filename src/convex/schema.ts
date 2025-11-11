import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const UserStatusDef = v.union(v.literal("active"), v.literal("deleted"));
export const UserFeatureDef = v.array(v.union(v.literal("task-sync"), v.literal("dev")));

export const UserDef = {
  authId: v.string(), // external user id from BetterAuth
  displayName: v.string(),
  avatarUrl: v.optional(v.string()),
  status: UserStatusDef,
  features: UserFeatureDef,
  settingOverrides: v.optional(v.any()),
}
export const ConvexTaskDef = {
  userAuthId: v.string(), // foreign key to users.authId
  title: v.string(),
  content: v.optional(v.string()),
  status: v.number(), // keep your numeric enum as-is
  todaysTask: v.optional(v.number()), // unix milliseconds or undefined
  priority: v.optional(v.number()),
  dueDate: v.optional(v.number()),
  parents: v.array(v.string()),  // store task ids as strings
  children: v.array(v.string()),
  lastEdit: v.number(),  // unix milliseconds
  created: v.number(),  // unix milliseconds
}


export default defineSchema({
  users: defineTable(
    UserDef
  ).index("by_authId", ["authId"]),

  tasks: defineTable(ConvexTaskDef)
    .index("by_user", ["userAuthId"])
    .index("by_todays_task", ["userAuthId", "todaysTask"]),
});