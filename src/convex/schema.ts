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
  uiPrefs: v.optional(v.object({
    showStreak: v.optional(v.boolean()),
    showVelocity: v.optional(v.boolean()),
    showMomentumScore: v.optional(v.boolean()),
    showNextAction: v.optional(v.boolean()),
    showMicroWins: v.optional(v.boolean()),
  })),
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

export default defineSchema({
  users: defineTable(
    UserDef
  ).index("by_authId", ["authId"])
   .index("by_status", ["status"]),
  nodes: defineTable(NodeDef)
    .index("by_user", ["userAuthId"])
    .index("by_user_type", ["userAuthId", "data.type"])
    .index("by_users_daily_tasks", ["userAuthId", "data.todaysTask"]),



  //#region Skill Sprints

  skillSprints: defineTable({
    userAuthId: v.string(),
    title: v.string(),
    goal: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userAuthId"]),

  skillSprintPlans: defineTable({
    sprintId: v.id("skillSprints"),
    md: v.string(),
    version: v.number(),
    updatedAt: v.number(),
  }).index("by_sprintId", ["sprintId"]),

  skillSprintAdjustments: defineTable({
    sprintId: v.id("skillSprints"),
    createdAt: v.number(),
    md: v.string(),
  }).index("by_sprintId", ["sprintId"]),

  skillSprintDailyChallenges: defineTable({
    sprintId: v.id("skillSprints"),
    dayKey: v.string(),
    generatedAt: v.number(),
    planVersion: v.number(),
    items: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        detailsMd: v.optional(v.string()),
        completedAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_sprintId", ["sprintId"])
    .index("by_sprintId_dayKey", ["sprintId", "dayKey"]),

  skillSprintJournalEntries: defineTable({
    sprintId: v.id("skillSprints"),
    dayKey: v.optional(v.string()),
    createdAt: v.number(),
    md: v.string(),
  }).index("by_sprintId", ["sprintId"]),
});

//#endregion