// convex/auth.ts
import { Err, NotAuthorizedError, NotFoundError, NotImplementedError } from "$domain/errors";
import { type User } from "$domain/models/user";
import { type Doc } from "./_generated/dataModel";
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { UserDef, UserFeatureDef, UserStatusDef } from "./schema";


//#region Shared Types

const typeLoginCredentials = v.union(
  v.object({
    type: v.literal("email_password"),
    email: v.string(),
    password: v.string(),
  }),
  v.object({
    type: v.literal("external"),
  }),
);

//#endregion

export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.auth.getUserIdentity();
    return id ? { authId: id.subject, email: id.email } : null;
  },
});

export const watchUser = query({
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
      _creationTime: user._creationTime, // not stored yet; adjust if you add createdAt
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
        _creationTime: user!._creationTime,
        status: (user!.status ?? "active") as "active" | "deleted",
        features: user!.features ?? [],
        settingOverrides: user!.settingOverrides ?? undefined,
      }));
  },
});

export const register = mutation({
  args: {
    // You may validate shape more strictly; align with your LocalUser
    creds: typeLoginCredentials,
    userData: v.object(UserDef),
  },
  handler: async (ctx, { creds, userData }) => {
    // Normally you'd validate creds via BetterAuth and ensure authId (userData.id)
    // exists/allowed. For now assume userData.id is validated externally.
    if (creds.type !== "external") {
      throw new Error("Only social login is implemented with Convex + WorkOS");
    }

    // TODO get authId from auth provider registration
    const authId = "TODO:authId";
    ctx.auth.getUserIdentity();

    // Upsert by authId
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
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
      authId: authId,
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
  args: v.object({
    id: v.string(), // external user id from BetterAuth
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    status: v.optional(UserStatusDef),
    features: v.optional(UserFeatureDef),
    settingOverrides: v.optional(v.any()),
  }),
  handler: async (ctx, update) => {
    const id = await ctx.auth.getUserIdentity();
    if (!id) throw new Error("User identity not available");

    const authId = id.subject;
    if (authId !== update.id) return {
      ok: false as const,
      error: serializeError(new NotAuthorizedError(`Authenticated user does not ow target account`, update))
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (!existing) {
      return {
        ok: false as const,
        error: serializeError(new NotFoundError("User not found", update.id)),
      };
    }

    const patch = userToPatch(update);


    if (Object.keys(patch).length) {
      await ctx.db.patch(existing._id, patch);
    }

    const refreshed = await ctx.db.get(existing._id);

    return {
      ok: true as const,
      value: rowToAuthenticatedUser(refreshed as Doc<'users'>),
    }
  },
});

export const deleteUser = mutation({
  args: { userId: v.string() }, // authId
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", userId))
      .unique();

    if (!existing) {
      return {
        ok: false as const,
        error: serializeError(new NotFoundError("User not found", userId)),
      };
    }

    // Soft delete by marking status: "deleted" (your schema supports that)
    await ctx.db.patch(existing._id, { status: "deleted" });

    return { ok: true as const, value: undefined };
  },
});

export const login = mutation({
  args: {
    creds: typeLoginCredentials,
  },
  handler: async (_ctx, _args) => {
    // Delegated to your auth provider; return NotImplemented as Result
    return {
      ok: false as const,
      error: serializeError(new NotImplementedError("ConvexAuth.login"))
    };
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    // Get authenticated user from BetterAuth
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new Error("Not authenticated");
    }

    const authId = identity.subject;
    const displayName = identity.name || identity.email || "New User";

    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (existing) {
      return { ok: true as const, userId: existing.authId };
    }

    // Create new user record
    const _id = await ctx.db.insert("users", {
      authId,
      displayName,
      avatarUrl: undefined,
      status: "active",
      /**
       * TODO: Temp:IMPORTANT - This allows us to skip local optimistic updates, 
       * at the cost of grandfathering in users to our first income source...
       * It's worth it while figuring out the UX, but should change ASAP
       */
      features: ['task-sync'],
      settingOverrides: undefined,
    });

    const inserted = await ctx.db.get(_id);
    return { ok: true as const, userId: inserted!.authId };
  },
});

/* export const upsertCurrentUser = internalMutation({
  args: argsUser,
  handler: async (ctx, { id, displayName }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", id))
      .unique();

    if (existing) {
      return { ok: true as const, userId: existing.authId };
    }

    const _id = await ctx.db.insert("users", {
      authId: id,
      displayName: displayName ?? "New User",
      avatarUrl: undefined,
      status: "active",
      features: [],
      settingOverrides: undefined,
    });

    const inserted = await ctx.db.get(_id);
    return { ok: true as const, userId: inserted!.authId };
  },
}); */


//#region Utilities

function serializeError<T extends Err>(err: T): T {
  return JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)));
}

function rowToAuthenticatedUser(row: Doc<"users">): User {
  return {
    ...row,
    id: row.authId,
    createdAt: row._creationTime as any, // Dates are not supported in Convex
    status: row.status ?? "active",
    features: row.features ?? [],
  };
}
function rowToPublicUser(row: Doc<"users">): User {
  const cleanedUser: Partial<User> = rowToAuthenticatedUser(row);
  delete cleanedUser.features;
  delete cleanedUser.settingOverrides;
  return cleanedUser as User;
}

function userToRow(user: User): Omit<Doc<'users'>, '_id' | '_creationTime'> {
  return userToPatch(user) as Omit<Doc<'users'>, '_id' | '_creationTime'>;
}

function userToPatch(user: Partial<User>): Partial<Omit<Doc<'users'>, '_id' | '_creationTime'>> {
  const authId = user.id;

  delete user.createdAt;
  delete user.id;

  return {
    ...user,
    authId
  }
}

//#endregion