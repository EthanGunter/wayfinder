// convex/auth.ts
import { InvalidStateError } from "$domain/errors";
import type { EnsureUserErr, UpdateErr, WatchUserErr, User } from "$domain/models/user";
import type { Doc, TableNames, DataModel } from "../_generated/dataModel";
import { query, mutation, internalMutation, internalQuery, action, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import { UserFeatureDef, UserStatusDef } from "../schema";
import { authComponent, createAuth } from "../auth";
import type { IndexNames, NamedTableInfo } from "convex/server";


//#region Shared Types

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

    if (user.status === 'deleted') {
      throw new ConvexError<WatchUserErr>({ type: "InvalidStateError", msg: "Account scheduled for deletion. Please wait." });
    }

    // Normalize: Convex stores timestamps as numbers; your model expects Date.
    return rowToAuthenticatedUser(user);
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
    return (results
      .filter((user) => {
        if (user && user.status === 'deleted') {
          // We filter out deleted users silently in bulk fetch to avoid breaking the entire batch
          return false;
        }
        return !!user;
      }) as NonNullable<Doc<"users">>[])
      .map(rowToAuthenticatedUser);
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
    if (!id) throw new ConvexError<UpdateErr>({ type: "NotAuthorizedError", msg: "User identity not available" });

    const authId = id.subject;
    if (authId !== update.id)
      throw new ConvexError<UpdateErr>({
        type: "NotAuthorizedError",
        msg: "Authenticated user does not own target account",
        ctx: { targetId: update.id }
      });

    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();

    if (!existing) {
      throw new ConvexError<UpdateErr>({ type: "NotFoundError", msg: "User not found", ctx: { userId: update.id } });
    }

    const patch = userToPatch(update);


    if (Object.keys(patch).length) {
      await ctx.db.patch(existing._id, patch);
    }

    const refreshed = await ctx.db.get(existing._id);
    if (refreshed)
      return rowToAuthenticatedUser(refreshed);
    else throw new InvalidStateError("User not found after update", { messageForDev: "User not found after update", ctx: update.id });
  },
});

export const deleteSelf = mutation({
  // no args; derive from auth
  args: {},
  handler: async (ctx) => {
    const ident = await ctx.auth.getUserIdentity();
    if (!ident) {
      throw new ConvexError({
        type: "AuthError",
        msg: "No user session found",
      });
    }

    const authId = ident.subject;

    // Revoke sessions for current user (self-scoped BetterAuth API).
    // No body; uses headers to identify the user.
    try {
      const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
      await auth.api.deleteUser({ body: {}, headers });
      await auth.api.revokeSessions({ headers });
    } catch {
      // Don’t fail the deletion if revoke has issues; just log if you have logging.
    }

    // Cascade delete all data owned by this user (nodes first, then legacy tasks).
    // Use batched deletion via indexes to handle large volumes.
    let deletedNodes = 0;
    const deletedLegacyTasks = 0;

    // nodes by userAuthId
    deletedNodes += await deleteByIndexBatched(
      ctx,
      "nodes",
      "by_user",
      { userAuthId: authId },
      BATCH_LIMIT
    );

    // Fetch the app user row (idempotent if already gone).
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .first();

    // Finally, delete the user document last so foreign-key-ish cleanup above can find it.
    if (user) {
      await ctx.db.delete(user._id);
    }

    return {
      nodes: deletedNodes,
      tasks: deletedLegacyTasks,
      user: user ? 1 : 0,
    };
  },
});

export const getUserByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    return ctx.db.query("users").withIndex("by_authId", q => q.eq("authId", authId)).unique();
  }
});

export const createUser = internalMutation({
  args: { authId: v.string(), displayName: v.string(), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("users", {
      authId: args.authId,
      displayName: args.displayName,
      avatarUrl: args.avatarUrl,
      status: "active",
      /**
       * TODO: Temp:IMPORTANT - This allows us to skip local optimistic updates, 
       * at the cost of grandfathering in users to our first income source...
       * It's worth it while figuring out the UX, but should change ASAP
       */
      features: [],
      settingOverrides: undefined,
    });
    return args.authId;
  }
});

export const ensureCurrentUser = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    // Get authenticated user from BetterAuth
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      throw new ConvexError<EnsureUserErr>({ type: "InvalidStateError", msg: "No user session found" });
    }

    const authId = identity.subject;
    const displayName = identity.name || identity.email || "New User";

    // Check if user exists
    const existing = await ctx.runQuery(internal.users.getUserByAuthId, { authId });
    if (existing) return existing.authId;
    else {
      // Create new user record
      return await ctx.runMutation(internal.users.createUser, {
        authId,
        displayName,
        avatarUrl: undefined,
      });
    }
  },
});


//#region Utilities

// Tunables
const BATCH_LIMIT = 500; // delete in chunks to avoid long transactions/timeouts

async function deleteByIndexBatched<TableName extends TableNames, IndexName extends IndexNames<NamedTableInfo<DataModel, TableName>>>(
  ctx: MutationCtx,
  table: TableName,
  indexName: IndexName,
  indexFilter: Record<string, unknown>,
  limit = BATCH_LIMIT
) {
  let total = 0;
  // Loop until no more docs match (idempotent)
  // Note: Convex transactions are short; keep each batch small.
  while (true) {
    const q = ctx.db.query(table).withIndex(indexName, (q) => {
      // We use `any` here because the IndexRangeBuilder type narrows with each .eq() call,
      // preventing use of a static type for the accumulator in a loop/reduce.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let builder: any = q;
      for (const [field, value] of Object.entries(indexFilter)) {
        builder = builder.eq(field, value);
      }
      return builder;
    });

    // Collect a limited batch
    const batch: Doc<TableName>[] = [];
    for await (const doc of q) {
      batch.push(doc);
      if (batch.length >= limit) break;
    }
    if (batch.length === 0) break;

    // Delete each doc
    for (const d of batch) {
      await ctx.db.delete(d._id);
      total++;
    }
  }
  return total;
}

function rowToAuthenticatedUser(row: Doc<"users">): User<number> {
  return {
    id: row.authId,
    displayName: row.displayName,
    // Dates are not supported in Convex
    // TODO:refactor consider SystemAgnosticUser<T>
    createdAt: row._creationTime,
    status: row.status ?? "active",
    features: row.features ?? [],
    avatarUrl: row.avatarUrl,
    settingOverrides: row.settingOverrides,
  };
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
