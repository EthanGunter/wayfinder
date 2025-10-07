// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Convex doc ids are `_id: Id<"users">` but you can store external ids as fields too.
    // We'll store BetterAuth user id as `authId` (string) and reference by that.
    authId: v.string(), // external user id from BetterAuth
    display_name: v.string(),
    avatar_url: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
    features: v.optional(v.array(v.string())),
    created_at: v.string(), // ISO string
    setting_overrides: v.optional(v.any()),
  }).index("by_authId", ["authId"]),

  tasks: defineTable({
    user_auth_id: v.string(), // foreign key to users.authId
    title: v.string(),
    content: v.optional(v.string()),
    status: v.number(), // keep your numeric enum as-is
    todays_task: v.optional(v.string()), // ISO or undefined
    priority: v.optional(v.number()),
    parents: v.optional(v.array(v.string())),  // store task ids as strings
    children: v.optional(v.array(v.string())),
    created: v.string(),    // ISO
    last_edit: v.string(),  // ISO
  })
  .index("by_user", ["user_auth_id"])
  .index("by_todays_task", ["user_auth_id", "todays_task"]),
});