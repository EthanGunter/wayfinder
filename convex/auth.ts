// convex/auth.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { err, ok, type Result } from "../src/domain/_result";
import type { User } from "../src/domain/_types";

// Placeholder: replace with BetterAuth token validation
async function getAuthIdentity(ctx: any): Promise<{ authId: string } | null> {
  // e.g., read ctx.auth, or ctx.request headers via action (if using actions)
  return null;
}

export const getRegistrationRequirements = query({
  args: { type: v.string(), email: v.optional(v.string()), password: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const issues: { target: number; message: string }[] = [];
    if (args.type === "email_password") {
      if (!args.email || args.email.trim() === "") issues.push({ target: 0, message: "Email required" });
      else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+[.][A-Za-z.]{2,}$/.test(args.email)) issues.push({ target: 0, message: "Email format invalid" });
      if (!args.password) issues.push({ target: 1, message: "Password required" });
      else if (args.password.length < 8) issues.push({ target: 1, message: "Password must be at least 8 characters" });
    } else {
      return err({ type: "NotImplementedError", message: `ConvexAuth.migrate => ${args.type}` });
    }
    return ok(issues);
  },
});

export const register = mutation({
  args: {
    creds: v.object({
      type: v.literal("email_password"),
      email: v.string(),
      password: v.string(),
    }),
    userData: v.object({
      id: v.string(), // BetterAuth will own this; for now accept provided or generate
      display_name: v.string(),
      avatar_url: v.optional(v.string()),
      features: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, { creds, userData }) => {
    // In BetterAuth flow, you'd not create auth user here; assume auth is external.
    // We only create our app user profile when auth exists.
    const now = new Date().toISOString();

    // Ensure uniqueness by authId
    const users = ctx.db.query("users").withIndex("by_authId", q => q.eq("authId", userData.id)).collect();
    if ((await users).length > 0) {
      return err({ type: "ArgumentError", message: "User already registered", code: "user_already_exists" });
    }

    await ctx.db.insert("users", {
      authId: userData.id,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      status: "active",
      features: userData.features ?? [],
      created_at: now,
      setting_overrides: undefined,
    });

    const created: User = {
      id: userData.id,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      created_at: now,
      status: "active",
      features: userData.features ?? [],
    };
    return ok(created);
  },
});

export const getUser = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const users = await ctx.db.query("users").withIndex("by_authId", q => q.eq("authId", id)).collect();
    if (users.length === 0) return err({ type: "NotFoundError", message: id });
    const u = users[0];
    if (u.status === "deleted") return err({ type: "NotFoundError", message: "User account has been deleted" });
    const mapped: User = {
      id,
      display_name: u.display_name,
      avatar_url: u.avatar_url ?? undefined,
      created_at: u.created_at,
      status: (u.status ?? "active") as User["status"],
      features: u.features ?? [],
      setting_overrides: u.setting_overrides,
    };
    return ok(mapped);
  },
});

export const updateUser = mutation({
  args: {
    update: v.object({
      id: v.string(),
      display_name: v.optional(v.string()),
      avatar_url: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
      setting_overrides: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { update }) => {
    const users = await ctx.db.query("users").withIndex("by_authId", q => q.eq("authId", update.id)).collect();
    if (users.length === 0) return err({ type: "NotFoundError", message: update.id });

    const row = users[0];
    if (row.status === "deleted") return err({ type: "NotFoundError", message: "Cannot update deleted user account" });

    await ctx.db.patch(row._id, {
      display_name: update.display_name ?? row.display_name,
      avatar_url: update.avatar_url ?? row.avatar_url,
      status: update.status ?? row.status,
      setting_overrides: update.setting_overrides ?? row.setting_overrides,
    });

    const fresh = await ctx.db.get(row._id);
    const mapped: User = {
      id: update.id,
      display_name: fresh!.display_name,
      avatar_url: fresh!.avatar_url ?? undefined,
      created_at: fresh!.created_at,
      status: (fresh!.status ?? "active") as User["status"],
      features: fresh!.features ?? [],
      setting_overrides: fresh!.setting_overrides,
    };
    return ok(mapped);
  },
});

export const deleteUser = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const users = await ctx.db.query("users").withIndex("by_authId", q => q.eq("authId", userId)).collect();
    if (users.length === 0) return err({ type: "NotFoundError", message: userId });
    const row = users[0];
    await ctx.db.patch(row._id, { status: "deleted" });
    return ok(undefined);
  },
});

// Session-capable stubs; wire to BetterAuth later
export const getSessionMaterial = query({
  args: { userId: v.string() },
  handler: async () => ok<string | null>(null),
});
export const restoreSession = mutation({
  args: { userId: v.string(), material: v.string() },
  handler: async () => ok<{ rotatedMaterial?: string }>({}),
});