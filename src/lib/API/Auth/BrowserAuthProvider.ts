import { type IDBPDatabase } from 'idb';
import { v4 } from 'uuid';
import type { IAuthCore, IAuthAPI, ILocalAuth, ILocalMigrator, SignInCredentials, StoredUser, IAuthAPIResponseHandler, IAuthCoreResponseHandler, IMigrationResponseHandler, ILocalAuthProvider } from './types';
import type { ITaskAPI } from '../Tasks';
import { AUTH_TABLE_NAME, authDBPromise, type AuthDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError } from '$lib/Errors';
import { invalidateAll } from '$app/navigation';
import { SyncQueue } from '../SyncQueue';


let currentUserId: string | null = null;

let db: IDBPDatabase<AuthDB> | null;
let remoteAuth: IAuthAPI | null;
let remoteTask: ITaskAPI | null;
const authStateListeners: Set<(user: StoredUser | null) => void> = new Set();

// TODO: Wrap the task API so we call local functions first, then the remote,
// TODO: and handle rolling back local changes whenever the remote fails...
const local: ILocalAuth = {
  createUser: async function ({ user }) {
    assertDB(db);

    await db.put(AUTH_TABLE_NAME, user);
    return ok(user);
  },

  getMostRecentUser: async function () {
    assertDB(db);

    // Get all users and sort by last_active
    const users = await db.getAll(AUTH_TABLE_NAME);
    if (users.length === 0) return null;

    // Sort by last_active descending
    users.sort((a, b) => {
      const dateA = new Date(a.last_active).getTime();
      const dateB = new Date(b.last_active).getTime();
      return dateB - dateA;
    });

    return users[0];
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
    assertDB(db);

    const user = await db.get(AUTH_TABLE_NAME, userId);
    if (!user) {
      Err.throw(new NotFoundError(userId, "User"));
    }

    await setCurrentUser(user.id);
    return /*toLocalUserProxy(*/ user /*)*/;
  },

  activateNewAnonymousUser: async function () {
    assertDB(db);

    const anonymousUser: StoredUser = {
      id: v4(),
      display_name: undefined, // Anonymous users have no display name
      last_active: new Date(),
      auth_provider: 'local',
      is_synced: false,
    };

    await db.put(AUTH_TABLE_NAME, anonymousUser);
    await setCurrentUser(anonymousUser.id);

    return /*toLocalUserProxy(*/anonymousUser/*)*/;
  },

  getAnonymousUser: async function () {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    return users.find(user => !user.display_name) || null;
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

  getCurrentUser: async function () {
    assertDB(db);
    if (!currentUserId) return err(new InvalidStateError('No user currently signed in'));

    const user = await db.get(AUTH_TABLE_NAME, currentUserId);
    if (!user) Err.throw(new NotFoundError("Failed to find a user stored as currentUserId", currentUserId));

    return ok(user);
  },

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
      // Can't delete the current user
      if (userId === currentUserId) {
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
    currentUserId = null;
    invalidateAll(); // TODO does invalidateAll() work here? Test...
    return ok();
  },
  handleSignOutResponse() {
    Err.throw(new NotImplementedError("BrowserAuthProvider.undoSignOut"))
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

function assertDB(db: IDBPDatabase<AuthDB> | null, errorMessage?: string): asserts db is IDBPDatabase<AuthDB> {
  if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()"));
}
function assertRemoteAuth(remoteAuth: IAuthAPI | null, errorMessage: string): asserts remoteAuth is IAuthAPI {
  if (!remoteAuth) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote auth without a provider."));
}
function assertRemoteTasks(remoteTasks: ITaskAPI | null, errorMessage: string): asserts remoteTasks is ITaskAPI {
  if (!remoteTasks) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote tasks without a provider."));
}

async function setCurrentUser(userId: string): Promise<void> {
  assertDB(db);

  currentUserId = userId;

  // Update last active time
  const user = await db.get(AUTH_TABLE_NAME, userId);
  if (user) {
    user.last_active = new Date();
    await db.put(AUTH_TABLE_NAME, user);

    // Notify listeners
    notifyListeners(/* toLocalUserProxy( */user/* ) */);
  }
}

function notifyListeners(user: StoredUser | null): void {
  authStateListeners.forEach(callback => callback(user));
}

// #endregion

const api = { ...core, ...local, ...migrator }

const BrowserAuthProvider: ILocalAuthProvider = {
  get: async function (remoteAuthProvider, remoteTaskProvider) {
    db = await authDBPromise;
    remoteAuth = remoteAuthProvider ?? null;
    remoteTask = remoteTaskProvider ?? null;

    if (remoteAuthProvider && remoteTaskProvider) {
      authSyncQueue = new SyncQueue<Omit<IAuthAPI,
        | "getCurrentUser"
        | "getMigrationRequirements"
        | "getUser">, IAuthAPIResponseHandler>({
          deleteUser: remoteAuth!.deleteUser,
          handleDeleteUserResponse: core.handleDeleteUserResponse,
          migrate: remoteAuth!.migrate,
          handleMigrateResponse: migrator.handleMigrateResponse,
          signIn: remoteAuth!.signIn,
          handleSignInResponse: core.handleSignInResponse,
          signOut: remoteAuth!.signOut,
          handleSignOutResponse: core.handleSignOutResponse,
          signUp: remoteAuth!.signUp,
          handleSignUpResponse: core.handleSignUpResponse,
          updateUser: remoteAuth!.updateUser,
          handleUpdateUserResponse: core.handleUpdateUserResponse,
        });
    }

    // Initialize with most recent user or create anonymous
    const mostRecentUser = await local.getMostRecentUser();
    if (mostRecentUser) {
      await setCurrentUser(mostRecentUser.id);
    } else {
      await local.activateNewAnonymousUser();
    }
    return api;
  },

  close: async function () {
    db?.close();
    db = null;
    currentUserId = null;
    authStateListeners.clear();
  }
};

export let authSyncQueue: SyncQueue<Omit<IAuthAPI,
  | "getCurrentUser"
  | "getMigrationRequirements"
  | "getUser">, IAuthAPIResponseHandler> | null = null;

export default BrowserAuthProvider;

// Export for testing
export { db, currentUserId };