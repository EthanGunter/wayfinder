import { type IDBPDatabase } from 'idb';
import { v4 } from 'uuid';
import type { IAuthCore, IAuthProvider, ILocalAuth, IMigrationProvider, MigrationRequirements, SignInCredentials, StoredUser, UnsubscribeFn, UserData } from './types';
import type { IProvider, ITaskProvider, IWrappedProvider } from '../Tasks';
import { AUTH_STORE_NAME, authDBPromise, type AuthDB } from '../localDB';
import { err, ok, type Result } from 'neverthrow';
import { ArgumentError, InvalidStateError, NotFoundError, NotImplementedError, type UnknownError } from '$lib/Errors';
import { invalidateAll } from '$app/navigation';


let db: IDBPDatabase<AuthDB> | null;
let remote: IAuthProvider | null;
let currentUserId: string | null = null;
const authStateListeners: Set<(user: StoredUser | null) => void> = new Set();


const core: IAuthCore = {
  signUp: async function (creds: SignInCredentials): Promise<Result<StoredUser, UnknownError>> {
    throw new NotImplementedError("BrowserAuthProvider.signUp");
  },

  getUser: async function (userId: string): Promise<Result<StoredUser, NotFoundError>> {
    assertDB(db);
    const user = await db.get(AUTH_STORE_NAME, userId);
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

    const user = await db.get(AUTH_STORE_NAME, currentUserId);
    if (!user) throw new Error(`Failed to find the user stored as currentUserId: ${currentUserId}`);

    return ok(user);
  },

  updateUser: async function (update: Partial<StoredUser> & { id: string }): Promise<Result<StoredUser, UnknownError>> {
    assertDB(db);

    const user = await db.get(AUTH_STORE_NAME, update.id);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = {
      ...user,
      ...update,
      id: user.id, // Ensure ID can't be changed
      last_active: new Date()
    };

    await db.put(AUTH_STORE_NAME, updatedUser);

    // If updating current user, notify listeners
    if (update.id === currentUserId) {
      // notifyListeners(toLocalUserProxy(updatedUser));
    }

    return ok(updatedUser);
  },

  deleteUser: async function (userId: string): Promise<Result<void, InvalidStateError>> {
    assertDB(db);

    // Can't delete the current user
    if (userId === currentUserId) {
      await this.signOut();
    }

    await db.delete(AUTH_STORE_NAME, userId);

    return ok();
  },

  signIn: async function (creds: SignInCredentials): Promise<Result<StoredUser, UnknownError>> {
    assertDB(db);

    switch (creds.type) {
      default: throw new ArgumentError(creds, `${creds.type} sign in not implemented for local auth`);
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
      db.get(AUTH_STORE_NAME, currentUserId).then(user => {
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

const local: ILocalAuth = {
  createUser: async function (user: StoredUser): Promise<Result<StoredUser, UnknownError>> {
    assertDB(db);

    await db.put(AUTH_STORE_NAME, user);
    return ok(user);
  },

  switchUser: async function (userId: string): Promise<StoredUser> {
    assertDB(db);

    const user = await db.get(AUTH_STORE_NAME, userId);
    if (!user) {
      throw new Error('User not found');
    }

    await setCurrentUser(user.id);
    return /*toLocalUserProxy(*/ user /*)*/;
  },

  listUsers: async function (): Promise<StoredUser[]> {
    assertDB(db);
    const users = await db.getAll(AUTH_STORE_NAME);
    return users.map(user => /*toLocalUserProxy(*/ user /*)*/);
  },

  getMostRecentUser: async function (): Promise<StoredUser | null> {
    assertDB(db);

    // Get all users and sort by last_active
    const users = await db.getAll(AUTH_STORE_NAME);
    if (users.length === 0) return null;

    // Sort by last_active descending
    users.sort((a, b) => {
      const dateA = new Date(a.last_active).getTime();
      const dateB = new Date(b.last_active).getTime();
      return dateB - dateA;
    });

    return users[0];
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

    await db.put(AUTH_STORE_NAME, anonymousUser);
    await setCurrentUser(anonymousUser.id);

    return /*toLocalUserProxy(*/anonymousUser/*)*/;
  },

  getAnonymousUser: async function (): Promise<StoredUser | null> {
    assertDB(db);
    const users = await db.getAll(AUTH_STORE_NAME);
    return users.find(user => !user.display_name) || null;
  }
};

const migrator: IMigrationProvider = {
  getMigrationNeeds: function (cred) {
    assertRemote(remote, "Cannot migrate without a provided remote auth provider");
    return remote.getMigrationNeeds(cred);
  },
  migrate: async function (cred) {
    assertRemote(remote, "Cannot migrate without a provided remote auth provider");
    return remote.migrate(cred);
  }
}

// #region UTILITIES

function assertDB(db: IDBPDatabase<AuthDB> | null, errorMessage?: string): asserts db is IDBPDatabase<AuthDB> {
  if (!db) throw new InvalidStateError(errorMessage ?? "Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()").withTrace(3);
}
function assertRemote(remoteDB: IAuthProvider | null, errorMessage: string): asserts remoteDB is IAuthProvider {
  if (!remoteDB) throw new InvalidStateError(errorMessage ?? "Attempted to use Remote without a db connection.").withTrace(3);
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
  const user = await db.get(AUTH_STORE_NAME, userId);
  if (user) {
    user.last_active = new Date();
    await db.put(AUTH_STORE_NAME, user);

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

const api: IAuthProvider = { ...core, ...local, ...migrator }

const BrowserAuthProvider: IWrappedProvider<IAuthProvider> = {
  get: async function (internal?: IAuthProvider) {
    db = await authDBPromise;
    remote = internal ?? null;

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