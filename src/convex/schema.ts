import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    authId: v.string(), // external user id from BetterAuth
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
    features: v.optional(v.array(v.string())),
    settingOverrides: v.optional(v.any()),
  }).index("by_authId", ["authId"]),

  tasks: defineTable({
    userAuthId: v.string(), // foreign key to users.authId
    title: v.string(),
    content: v.optional(v.string()),
    status: v.number(), // keep your numeric enum as-is
    todaysTask: v.optional(v.number()), // unix milliseconds or undefined
    priority: v.optional(v.number()),
    parents: v.optional(v.array(v.string())),  // store task ids as strings
    children: v.optional(v.array(v.string())),
    lastEdit: v.number(),  // unix milliseconds
  })
    .index("by_user", ["userAuthId"])
    .index("by_todays_task", ["userAuthId", "todaysTask"]),
});