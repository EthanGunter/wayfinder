import { type IDBPDatabase } from 'idb';
import { v4 } from 'uuid';
import type { IAuthCore, IAuthAPI, ILocalAuth, ILocalMigrator, SignInCredentials, StoredUser, IAuthAPIResponseHandler, IAuthCoreResponseHandler, IMigrationResponseHandler, ILocalAuthProvider } from './types';
import type { ITaskAPI } from '../Tasks';
import { ACTIVEUSER_NAME as ACTIVEUSER_COLUMN_NAME, APP_TABLE_NAME, AUTH_TABLE_NAME as USER_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError } from '$lib/Errors';
import { invalidateAll } from '$app/navigation';
import { SyncQueue } from '../SyncQueue';

// TODO: Wrap the task API so we call local functions first, then the remote,
// TODO: and handle rolling back local changes whenever the remote fails...
// TODO: Force UI to update at appropriate times. onAuthChange callback might be required
const local: ILocalAuth = {
  /* createUser: async function ({ user }) {
    assertDB(db);

    await db.put(USER_TABLE_NAME, user);
    return ok(user);
  }, */
  updateUserId: async function (oldId, newId) {
    assertDB(db);

    const user = await db.get(USER_TABLE_NAME, oldId);
    if (!user) {
      return err(new NotFoundError(oldId, "User"));
    }

    const updatedUser = { ...user, id: newId };
    await db.put(USER_TABLE_NAME, updatedUser);
    if (oldId) {
      await db.delete(USER_TABLE_NAME, oldId);
    }

    return ok(updatedUser);
  },

  listUsers: async function () {
    assertDB(db);
    const users = await db.getAll(USER_TABLE_NAME);
    return users;
  },

  switchUser: async function (newUserId) {
    if (!newUserId || newUserId == '') Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use signOut if you want no active user"));
    assertDB(db);

    // Update last active time
    const user = await db.get(USER_TABLE_NAME, newUserId);
    if (user) {
      await db.put(APP_TABLE_NAME, newUserId, ACTIVEUSER_COLUMN_NAME);
      user.last_active = new Date();
      await db.put(USER_TABLE_NAME, user);
      return ok(user);
    } else {
      return err(new NotFoundError(newUserId, "User"));
    }
  },

  getDefaultUser: async function () {
    assertDB(db);
    const users = await db.getAll(USER_TABLE_NAME);
    if (users.length === 0) {
      // Only create the anonymous user the first time
      const newAnon: StoredUser = {
        id: v4(),
        display_name: undefined, // Anonymous users have no display name
        last_active: new Date(),
        auth_provider: 'local',
        is_synced: false,
      };

      await db.put(USER_TABLE_NAME, newAnon);
      return ok(newAnon);
    } else if (users.length === 1) {
      const anon = users[0];
      return ok(anon);
    } else {
      return err(new InvalidStateError("There are too many users to select a default"));
    }
  },

  getActiveUser: async function () {
    assertDB(db);
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeId) {
      const user = await db.get(USER_TABLE_NAME, activeId);
      return user ?? null;
    } else return null;
  }
};

const core: IAuthCore & IAuthCoreResponseHandler = {
  getUser: async function ({ id }) {
    assertDB(db);
    const user = await db.get(USER_TABLE_NAME, id);
    if (user) {
      return ok(user);
    }
    else {
      return err(new NotFoundError(id, "User"));
    }
  },

  updateUser: async function ({ update }) {
    assertDB(db);

    // const oldId = update.oldId ?? update.id; // TODO This should be its own local function

    const user = await db.get(USER_TABLE_NAME, update.id);
    if (!user) {
      Err.throw(new NotFoundError(update.id, "User"));
    }

    const updatedUser = {
      ...user,
      ...update,
      // last_active: new Date()
    };

    await db.put(USER_TABLE_NAME, updatedUser);
    if (update.id) {
      await db.delete(USER_TABLE_NAME, update.id);
    }

    authSyncQueue?.add('updateUser',
      { update },
      'handleUpdateUserResponse',
      {
        oldUser: user,
      },
      "User update failed"
    );

    return ok(updatedUser);
  },

  handleUpdateUserResponse: async function (response) {
    if (response.isErr()) {
      const { oldUser } = response.error;
      // Undo changes
      assertDB(db);
      await db.put(USER_TABLE_NAME, oldUser)
    }
  },

  deleteUser: async function ({ userId }) {
    assertDB(db);

    const user = await db.get(USER_TABLE_NAME, userId);

    if (user) {
      const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
      // Can't delete the current user
      if (userId === activeUserId) {
        await this.logout();
      }

      await db.delete(USER_TABLE_NAME, userId);

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
      await db.put(USER_TABLE_NAME, oldUser)
    }
  },

  register: async function ({ creds }) {
    Err.throw(new NotImplementedError("BrowserAuthProvider.signUp"));
  },
  handleSignUpResponse: async function (response) {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoSignUp"))
  },

  login: async function ({ creds }) {
    assertDB(db);

    switch (creds.type) {
      default: Err.throw(new ArgumentError(creds, `${creds.type} sign in not implemented for local auth`));
    }
  },
  handleSignInResponse: (creds) => {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoSignIn"))
  },

  logout: async function () {
    assertDB(db);
    await db.put(APP_TABLE_NAME, undefined, ACTIVEUSER_COLUMN_NAME);
    invalidateAll(); // TODO I think notification is a better approach than invalidateAll()
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
          login: remoteAuth!.login,
          handleSignInResponse: core.handleSignInResponse,
          logout: remoteAuth!.logout,
          register: remoteAuth!.register,
          handleSignUpResponse: core.handleSignUpResponse,
          updateUser: remoteAuth!.updateUser,
          handleUpdateUserResponse: core.handleUpdateUserResponse,
        });
    }

    // Initialize with active user or create anonymous
    const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeUserId) {
      // All this does is update the last_active field...
      // await api.switchUser({ userId: activeUserId });
    } else {
      const anonRes = await api.getDefaultUser();
      if (anonRes.isOk()) {
        await api.switchUser(anonRes.value.id);
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