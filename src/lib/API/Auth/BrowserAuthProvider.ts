import { type IDBPDatabase } from 'idb';
import { v4 } from 'uuid';
import type { IAuthCore, IAuthAPI, ILocalAuthFunctions, ILocalMigrationAPI, IMigrationAPI, MigrationRequirements, SignInCredentials, StoredUser, UnsubscribeFn, UserData } from './types';
import type { ITaskAPI } from '../Tasks';
import { AUTH_TABLE_NAME, authDBPromise, type AuthDB } from '../localDB';
import { err, ok, type Result } from 'neverthrow';
import { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError, type UnknownError } from '$lib/Errors';
import { invalidateAll } from '$app/navigation';
import type { ILocalAuthProvider } from '../types';


let db: IDBPDatabase<AuthDB> | null;
let remoteAuth: IAuthAPI | null;
let remoteTask: ITaskAPI | null;
let currentUserId: string | null = null;
const authStateListeners: Set<(user: StoredUser | null) => void> = new Set();

// TODO: Wrap the task API so we call local functions first, then the remote,
// TODO: and handle rolling back local changes whenever the remote fails...
const local: ILocalAuthFunctions = {
  createUser: async function (user: StoredUser): Promise<Result<StoredUser, UnknownError>> {
    assertDB(db);

    await db.put(AUTH_TABLE_NAME, user);
    return ok(user);
  },

  getMostRecentUser: async function (): Promise<StoredUser | null> {
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

  listUsers: async function (): Promise<StoredUser[]> {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    return users.map(user => /*toLocalUserProxy(*/ user /*)*/);
  },

  updateUser: async function (update) {
    assertDB(db);

    const oldId = update.oldId ?? update.id;

    const user = await db.get(AUTH_TABLE_NAME, oldId);
    if (!user) {
      Err.throw(new NotFoundError(oldId, "User"));
    }

    const updatedUser = {
      ...user,
      ...update,
      last_active: new Date()
    };

    await db.put(AUTH_TABLE_NAME, updatedUser);
    if (update.oldId) {
      await db.delete(AUTH_TABLE_NAME, update.oldId);
    }

    // If updating current user, notify listeners
    if (update.id === currentUserId) {
      // notifyListeners(toLocalUserProxy(updatedUser));
    }

    return ok(updatedUser);
  },

  switchUser: async function (userId: string): Promise<StoredUser> {
    assertDB(db);

    const user = await db.get(AUTH_TABLE_NAME, userId);
    if (!user) {
      Err.throw(new NotFoundError(userId, "User"));
    }

    await setCurrentUser(user.id);
    return /*toLocalUserProxy(*/ user /*)*/;
  },

  activateNewAnonymousUser: async function (): Promise<StoredUser> {
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

  getAnonymousUser: async function (): Promise<StoredUser | null> {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    return users.find(user => !user.display_name) || null;
  }
};

const core: IAuthCore = {
  signUp: async function (creds: SignInCredentials): Promise<Result<StoredUser, UnknownError>> {
    // Err.throw(new NotImplementedError("BrowserAuthProvider.signUp"));
    Err.throw(new NotImplementedError("BrowserAuthProvider.signUp"));
  },

  getUser: async function (userId: string): Promise<Result<StoredUser, NotFoundError>> {
    assertDB(db);
    const user = await db.get(AUTH_TABLE_NAME, userId);
    if (user) {
      return ok(user);
    }
    else {
      return err(new NotFoundError(userId, "User"));
    }
  },

  getCurrentUser: async function (): Promise<Result<StoredUser, InvalidStateError>> {
    assertDB(db);
    if (!currentUserId) return err(new InvalidStateError('No user currently signed in'));

    const user = await db.get(AUTH_TABLE_NAME, currentUserId);
    if (!user) Err.throw(new NotFoundError("Failed to find a user stored as currentUserId", currentUserId));

    return ok(user);
  },

  updateUser: local.updateUser,

  deleteUser: async function (userId: string): Promise<Result<void, InvalidStateError>> {
    assertDB(db);

    // Can't delete the current user
    if (userId === currentUserId) {
      await this.signOut();
    }

    await db.delete(AUTH_TABLE_NAME, userId);

    return ok();
  },

  signIn: async function (creds: SignInCredentials): Promise<Result<StoredUser, UnknownError>> {
    assertDB(db);

    switch (creds.type) {
      default: Err.throw(new ArgumentError(creds, `${creds.type} sign in not implemented for local auth`));
    }
  },

  signOut: async function (): Promise<Result<void, UnknownError>> {
    currentUserId = null;
    invalidateAll(); // TODO does invalidateAll() work here? Test...
    return ok();
  },

  onAuthStateChanged: function (callback: (user: StoredUser | null) => void): UnsubscribeFn {
    authStateListeners.add(callback);

    // Immediately call with current user
    if (currentUserId && db) {
      db.get(AUTH_TABLE_NAME, currentUserId).then(user => {
        if (user) {
          callback(/*toLocalUserProxy(*/user/*)*/);
        } else {
          callback(null);
        }
      });
    } else {
      callback(null);
    }

    return () => {
      authStateListeners.delete(callback);
    };
  }
}

const migrator: ILocalMigrationAPI = {
  getMigrationRequirements: function (cred) {
    assertRemoteAuth(remoteAuth, "Cannot migrate without a provided remote auth provider");
    // assertRemoteMigrator(remoteMigrator, "Cannot migrate without a provided remote migration provider");
    return remoteAuth.getMigrationRequirements(cred);
  },
  migrate: async function (user, cred) {
    assertRemoteAuth(remoteAuth, "Cannot migrate without a provided remote auth provider");
    assertRemoteTasks(remoteTask, "Cannot migrate without a provided remote auth provider");
    // assertRemoteMigrator(remoteMigrator, "Cannot migrate without a provided remote migration provider");
    return remoteAuth.migrate(user, cred, remoteTask);
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

// function toLocalUserProxy(user: StoredUser): StoredUser {
//   return {
//     id: user.id,
//     display_name: user.display_name,
//     avatar_url: user.avatar_url,
//     is_synced: user.is_synced,
//     last_active: new Date(user.last_active)
//   };
// }

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


// TODO: Implement proper hashing
function hashPasskey(passkey: string): string {
  // For now, just store as-is (NOT SECURE - only for development)
  // In production, use bcrypt, argon2, or similar
  return passkey;
}

function verifyPasskey(provided: string, stored: string): boolean {
  // TODO: Implement proper verification with hashing
  // For now, just compare directly (NOT SECURE - only for development)
  return provided === stored;
}

// #endregion

const api = { ...core, ...local, ...migrator }

const BrowserAuthProvider: ILocalAuthProvider = {
  get: async function (remoteAuthProvider, remoteTaskProvider) {
    db = await authDBPromise;
    remoteAuth = remoteAuthProvider ?? null;
    remoteTask = remoteTaskProvider ?? null;

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

export default BrowserAuthProvider;

// Export for testing
export { db, currentUserId };
