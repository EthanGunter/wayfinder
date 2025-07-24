import { type IDBPDatabase } from 'idb';
import { v4 } from 'uuid';
import type { IAuthCore, IAuthAPI, ILocalAuth, ILocalMigrator, SignInCredentials, StoredUser, IAuthAPIResponseHandler, IAuthCoreResponseHandler, IMigrationResponseHandler, ILocalAuthProvider } from './types';
import type { ITaskAPI } from '../Tasks';
import { ACTIVEUSER_NAME as ACTIVEUSER_COLUMN_NAME, APP_TABLE_NAME, AUTH_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError } from '$lib/Errors';
import { invalidateAll } from '$app/navigation';
import { SyncQueue } from '../SyncQueue';

// TODO: Wrap the task API so we call local functions first, then the remote,
// TODO: and handle rolling back local changes whenever the remote fails...
// TODO: Force UI to update at appropriate times. onAuthChange callback might be required
const local: ILocalAuth = {
  createUser: async function ({ user }) {
    assertDB(db);

    await db.put(AUTH_TABLE_NAME, user);
    return ok(user);
  },

  listUsers: async function () {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    return users;
  },

  updateUser: async function ({ update }) {
    assertDB(db);

    const oldId = update.oldId ?? update.id;

    const user = await db.get(AUTH_TABLE_NAME, oldId);
    if (!user) {
      Err.throw(new NotFoundError(oldId, "User"));
    }

    const updatedUser = {
      ...user,
      ...update,
      // last_active: new Date()
    };

    await db.put(AUTH_TABLE_NAME, updatedUser);
    if (update.oldId) {
      await db.delete(AUTH_TABLE_NAME, update.oldId);
    }

    authSyncQueue?.add('updateUser',
      { update },
      'handleUpdateUserResponse',
      {
        oldUser: user,
        newId: updatedUser.oldId ? updatedUser.id : undefined
      },
      "User update failed"
    );

    return ok(updatedUser);
  },

  switchUser: async function ({ userId }) {
    if (!userId || userId == '') Err.throw(new ArgumentError(userId, "UserId required to switch user. Use signOut if you want no active user"));
    assertDB(db);

    // Update last active time
    const user = await db.get(AUTH_TABLE_NAME, userId);
    if (user) {
      db.put(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME, userId);
      user.last_active = new Date();
      await db.put(AUTH_TABLE_NAME, user);
      return ok(user);
    } else {
      return err(new NotFoundError(userId, "User"));
    }
  },

  getAnonymousUser: async function () {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    const anon = users.find(user => !user.display_name);
    if (!anon) {
      const newAnon: StoredUser = {
        id: v4(),
        display_name: undefined, // Anonymous users have no display name
        last_active: new Date(),
        auth_provider: 'local',
        is_synced: false,
      };

      await db.put(AUTH_TABLE_NAME, newAnon);
      return ok(newAnon);
    } else {
      return ok(anon);
    }
  },

  getActiveUser: async function () {
    assertDB(db);
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (!activeId) return err(new InvalidStateError('No user currently signed in'));

    const user = await db.get(AUTH_TABLE_NAME, activeId);
    if (!user) Err.throw(new NotFoundError("Failed to find a user stored as currentUserId", activeId));

    return ok(user);
  }
};

const core: IAuthCore & IAuthCoreResponseHandler = {
  getUser: async function ({ id }) {
    assertDB(db);
    const user = await db.get(AUTH_TABLE_NAME, id);
    if (user) {
      return ok(user);
    }
    else {
      return err(new NotFoundError(id, "User"));
    }
  },

  getActiveUser: local.getActiveUser,

  updateUser: local.updateUser,
  handleUpdateUserResponse: async function (response) {
    if (response.isErr()) {
      const { oldUser, newId } = response.error;
      // Undo changes
      assertDB(db);
      if (newId) {
        await db.delete(AUTH_TABLE_NAME, newId);
      }
      await db.put(AUTH_TABLE_NAME, oldUser)
    }
  },

  deleteUser: async function ({ userId }) {
    assertDB(db);

    const user = await db.get(AUTH_TABLE_NAME, userId);

    if (user) {
      const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
      // Can't delete the current user
      if (userId === activeUserId) {
        await this.signOut();
      }

      await db.delete(AUTH_TABLE_NAME, userId);

      authSyncQueue?.add(
        'deleteUser',
        { userId },
        'handleDeleteUserResponse',
        { oldUser: user },
        `Failed to delete user: ${user.display_name ?? user.id}`
      )
    }

    return ok();
  },
  handleDeleteUserResponse: async function (response) {
    if (response.isErr()) {
      const { oldUser } = response.error;
      assertDB(db);
      await db.put(AUTH_TABLE_NAME, oldUser)
    }
  },

  signUp: async function ({ creds }) {
    Err.throw(new NotImplementedError("BrowserAuthProvider.signUp"));
  },
  handleSignUpResponse: async function (response) {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoSignUp"))
  },

  signIn: async function ({ creds }) {
    assertDB(db);

    switch (creds.type) {
      default: Err.throw(new ArgumentError(creds, `${creds.type} sign in not implemented for local auth`));
    }
  },
  handleSignInResponse: (creds) => {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoSignIn"))
  },

  signOut: async function () {
    assertDB(db);
    await db.put(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME, undefined);
    invalidateAll(); // TODO does invalidateAll() work here? Test...
    return ok();
  },
  // onAuthStateChanged: function (callback: (user: StoredUser | null) => void): UnsubscribeFn {
  //   authStateListeners.add(callback);

  //   // Immediately call with current user
  //   if (currentUserId && db) {
  //     db.get(AUTH_TABLE_NAME, currentUserId).then(user => {
  //       if (user) {
  //         callback(/*toLocalUserProxy(*/user/*)*/);
  //       } else {
  //         callback(null);
  //       }
  //     });
  //   } else {
  //     callback(null);
  //   }

  //   return () => {
  //     authStateListeners.delete(callback);
  //   };
  // }
}

const migrator: ILocalMigrator & IMigrationResponseHandler = {
  getMigrationRequirements: function (signUpCred) {
    assertRemoteAuth(remoteAuth, "Cannot migrate without a provided remote auth provider");
    return remoteAuth.getMigrationRequirements(signUpCred);
  },
  migrate: async function ({ user, signUpCred }) {
    assertRemoteAuth(remoteAuth, "Cannot migrate without a provided remote auth provider");
    assertRemoteTasks(remoteTask, "Cannot migrate without a provided remote auth provider");
    return remoteAuth.migrate({ user, signUpCred, taskProvider: remoteTask });
  },
  handleMigrateResponse: async function (result) {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoMigrate"))
  },
}

// #region UTILITIES

function assertDB(db: LocalDB | null, errorMessage?: string): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()"));
}
function assertRemoteAuth(remoteAuth: IAuthAPI | null, errorMessage: string): asserts remoteAuth is IAuthAPI {
  if (!remoteAuth) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote auth without a provider."));
}
function assertRemoteTasks(remoteTasks: ITaskAPI | null, errorMessage: string): asserts remoteTasks is ITaskAPI {
  if (!remoteTasks) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote tasks without a provider."));
}

// #endregion

let db: LocalDB | null;
let remoteAuth: IAuthAPI | null;
let remoteTask: ITaskAPI | null;

const api = { ...core, ...local, ...migrator }

const BrowserAuthProvider: ILocalAuthProvider = {
  get: async function (remoteAuthProvider, remoteTaskProvider) {
    db = await dbPromise;
    remoteAuth = remoteAuthProvider ?? null;
    remoteTask = remoteTaskProvider ?? null;

    if (remoteAuthProvider && remoteTaskProvider) {
      authSyncQueue = new SyncQueue<Omit<IAuthAPI,
        | "getActiveUser"
        | "getMigrationRequirements"
        | "getUser">, IAuthAPIResponseHandler>({
          deleteUser: remoteAuth!.deleteUser,
          handleDeleteUserResponse: core.handleDeleteUserResponse,
          migrate: remoteAuth!.migrate,
          handleMigrateResponse: migrator.handleMigrateResponse,
          signIn: remoteAuth!.signIn,
          handleSignInResponse: core.handleSignInResponse,
          signOut: remoteAuth!.signOut,
          signUp: remoteAuth!.signUp,
          handleSignUpResponse: core.handleSignUpResponse,
          updateUser: remoteAuth!.updateUser,
          handleUpdateUserResponse: core.handleUpdateUserResponse,
        });
    }

    // Initialize with active user or create anonymous
    const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeUserId) {
      await api.switchUser({ userId: activeUserId });
    } else {
      const anonRes = await api.getAnonymousUser();
      if (anonRes.isOk()) {
        await api.switchUser({ userId: anonRes.value.id });
      } else {
        // 
      }
    }

    return api;
  },

  close: async function () {
    db?.close();
    db = null;
  }
};

export let authSyncQueue: SyncQueue<Omit<IAuthAPI,
  | "getActiveUser"
  | "getMigrationRequirements"
  | "getUser">, IAuthAPIResponseHandler> | null = null;

export default BrowserAuthProvider;

// Export for testing
export { db };