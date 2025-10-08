// convex/auth.ts
import { NotFoundError, NotImplementedError } from "$domain/errors";
import { User } from "$domain/models/user";
import { Doc } from "./_generated/dataModel";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Types aligned with your schema
export const watchUser = query({
  // watch by authId (client passes User.id == authId)
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.id))
      .unique();

    if (!user) return null;

    // Normalize: Convex stores timestamps as numbers; your model expects Date.
    return {
      id: user.authId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
      createdAt: new Date(0), // not stored yet; adjust if you add createdAt
      status: (user.status ?? "active") as "active" | "deleted",
      features: user.features ?? [],
      settingOverrides: user.settingOverrides ?? undefined,
    };
  },
});

export const watchUsers = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.ids.length === 0) return [];
    // Fetch in chunks to avoid fanout (Convex will rerun when any match changes)
    // Since we only have index by_authId, query all by_authId individually
    const results = await Promise.all(
      args.ids.map(async (authId) => {
        return ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", authId))
          .unique();
      })
    );
    return results
      .filter(Boolean)
      .map((user) => ({
        id: user!.authId,
        displayName: user!.displayName,
        avatarUrl: user!.avatarUrl ?? undefined,
        createdAt: new Date(0),
        status: (user!.status ?? "active") as "active" | "deleted",
        features: user!.features ?? [],
        settingOverrides: user!.settingOverrides ?? undefined,
      }));
  },
});

export const register = mutation({
  args: {
    // You may validate shape more strictly; align with your LocalUser
    creds: v.object({
      type: v.literal("email_password"),
      email: v.string(),
      password: v.string(),
    }),
    userData: v.object({
      displayName: v.string(),
      avatarUrl: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
      features: v.optional(v.array(v.string())),
      settingOverrides: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { creds, userData }) => {
    // Normally you'd validate creds via BetterAuth and ensure authId (userData.id)
    // exists/allowed. For now assume userData.id is validated externally.
    console.log("register user", userData);
    // TODO get authId from auth provider registration
    const id = ctx.auth.getUserIdentity();



    // Upsert by authId
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", userData.id))
      .unique();

    if (existing) {
      // Update minimal fields
      await ctx.db.patch(existing._id, {
        displayName: userData.displayName,
        avatarUrl: userData.avatarUrl,
        status: userData.status ?? "active",
        features: userData.features ?? [],
        settingOverrides: userData.settingOverrides,
      });
      return {
        ok: true as const,
        value: {
          id: existing.authId,
          displayName: userData.displayName,
          avatarUrl: userData.avatarUrl ?? undefined,
          createdAt: new Date(0),
          status: (userData.status ?? "active") as "active" | "deleted",
          features: userData.features ?? [],
          settingOverrides: userData.settingOverrides ?? undefined,
        },
      };
    }

    const _id = await ctx.db.insert("users", {
      authId: userData.id,
      displayName: userData.displayName,
      avatarUrl: userData.avatarUrl,
      status: userData.status ?? "active",
      features: userData.features ?? [],
      settingOverrides: userData.settingOverrides,
    });

    const inserted = await ctx.db.get(_id);
    return {
      ok: true as const,
      value: {
        id: inserted!.authId,
        displayName: inserted!.displayName,
        avatarUrl: inserted!.avatarUrl ?? undefined,
        createdAt: new Date(0),
        status: (inserted!.status ?? "active") as "active" | "deleted",
        features: inserted!.features ?? [],
        settingOverrides: inserted!.settingOverrides ?? undefined,
      },
    };
  },
});

export const updateUser = mutation({
  args: {
    update: v.object({
      id: v.string(), // authId
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      status: v.optional(v.union(v.literal("active"), v.literal("deleted"))),
      features: v.optional(v.array(v.string())),
      settingOverrides: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { update }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", update.id))
      .unique();

    if (!existing) {
      return {
        ok: false as const,
        error: new NotFoundError("User not found", update.id),
      };
    }

    const patch: Record<string, any> = {};
    if (update.displayName !== undefined) patch.displayName = update.displayName;
    if (update.avatarUrl !== undefined) patch.avatarUrl = update.avatarUrl;
    if (update.status !== undefined) patch.status = update.status;
    if (update.features !== undefined) patch.features = update.features;
    if (update.settingOverrides !== undefined) patch.settingOverrides = update.settingOverrides;

    if (Object.keys(patch).length) {
      await ctx.db.patch(existing._id, patch);
    }

    const refreshed = await ctx.db.get(existing._id);
    return {
      ok: true as const,
      value: rowToUser(refreshed as Doc<'users'>),
    }
  },
});

export const deleteUser = mutation({
  args: { userId: v.string() }, // authId
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", userId))
      .unique();

    if (!existing) {
      return {
        ok: false as const,
        error: new NotFoundError("User not found", userId),
      };
    }

    // Soft delete by marking status: "deleted" (your schema supports that)
    await ctx.db.patch(existing._id, { status: "deleted" });

    return { ok: true as const, value: undefined };
  },
});

export const login = mutation({
  args: {
    creds: v.object({
      type: v.literal("email_password"),
      email: v.string(),
      password: v.string(),
    }),
  },
  handler: async (_ctx, _args) => {
    // Delegated to your auth provider; return NotImplemented as Result
    return {
      ok: false as const,
      error: new NotImplementedError("ConvexAuth.login")
    };
  },
});

export const logout = mutation({
  args: {},
  handler: async (_ctx, _args) => {
    return { ok: true as const, value: undefined };
  },
});


//#region Utilities

function rowToUser(row: Doc<"users">): User {
  return {
    ...row,
    id: row.authId,
    createdAt: new Date(row._creationTime),
    status: row.status ?? "active",
    features: row.features ?? [],
  };
}

function userToRow(user: User): Omit<Doc<'users'>, '_id' | '_creationTime'> {
  return {
    ...user,
    authId: user.id
  }
}

//#endregion