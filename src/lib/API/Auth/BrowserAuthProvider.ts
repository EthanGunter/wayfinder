import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { v4 } from 'uuid';
import type { StoredUser, UnsubscribeFn } from './types';
import type { IProvider } from '../Tasks';
import { AUTH_STORE_NAME, authDBPromise, type AuthDB } from '../localDB';

interface LocalAuthAPI {
  getCurrentUser: () => Promise<StoredUser | null>
  signUp: (details: { displayName: string; passkey?: string }) => Promise<StoredUser>,
  signIn: (userId: string, passkey?: string) => Promise<StoredUser>,
  signOut: () => Promise<void>,
  switchUser: (userId: string) => Promise<StoredUser>,
  listUsers: () => Promise<StoredUser[]>,
  updateUser: (userId: string, updates: Partial<StoredUser>) => Promise<StoredUser>,
  deleteUser: (userId: string) => Promise<void>,
  onAuthStateChanged: (callback: (user: StoredUser | null) => void) => UnsubscribeFn,
  getMostRecentUser: () => Promise<StoredUser | null>,
  activateNewAnonymousUser: () => Promise<StoredUser>,
  getAnonymousUser: () => Promise<StoredUser | null>,
}



let db: IDBPDatabase<AuthDB> | null;
let currentUserId: string | null = null;
const authStateListeners: Set<(user: StoredUser | null) => void> = new Set();

const localAuthProvider: IProvider<LocalAuthAPI> = {
  get: async function () {
    db = await authDBPromise;

    // Initialize with most recent user or create anonymous
    const mostRecentUser = await getMostRecentUser();
    if (mostRecentUser) {
      await setCurrentUser(mostRecentUser.id);
    } else {
      await activateNewAnonymousUser();
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

const authOperations = {
  getCurrentUser: async function (): Promise<StoredUser | null> {
    assertDB(db);
    if (!currentUserId) return null;

    const user = await db.get(AUTH_STORE_NAME, currentUserId);
    if (!user) return null;

    return /*toLocalUserProxy(*/user/*)*/;
  },

  signUp: async function (details: { displayName: string; passkey?: string }): Promise<StoredUser> {
    assertDB(db);

    // Check if there's an anonymous user to upgrade
    const anonymousUser = await getAnonymousUser();

    if (anonymousUser) {
      // Upgrade the anonymous user
      anonymousUser.display_name = details.displayName;
      anonymousUser.passkey = details.passkey ? hashPasskey(details.passkey) : undefined;

      await db.put(AUTH_STORE_NAME, anonymousUser);
      await setCurrentUser(anonymousUser.id);

      return /*toLocalUserProxy(*/anonymousUser/*)*/;
    } else {
      // Create a new user
      const newUser: StoredUser = {
        id: v4(),
        display_name: details.displayName,
        last_active: new Date(),
        passkey: details.passkey ? hashPasskey(details.passkey) : undefined,
        auth_provider: 'local',
        is_synced: false
      };

      await db.put(AUTH_STORE_NAME, newUser);
      await setCurrentUser(newUser.id);

      return /*toLocalUserProxy(*/newUser/*)*/;
    }
  },

  signIn: async function (userId: string, passkey?: string): Promise<StoredUser> {
    assertDB(db);

    const user = await db.get(AUTH_STORE_NAME, userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify passkey if the user has one
    if (user.passkey && passkey) {
      if (!verifyPasskey(passkey, user.passkey)) {
        throw new Error('Invalid passkey');
      }
    } else if (user.passkey && !passkey) {
      throw new Error('Passkey required');
    }

    await setCurrentUser(user.id);
    return /*toLocalUserProxy(*/user/*)*/;
  },

  signOut: async function (): Promise<void> {
    // Create a new anonymous user
    await activateNewAnonymousUser();
  },

  switchUser: async function (userId: string): Promise<StoredUser> {
    assertDB(db);

    const user = await db.get(AUTH_STORE_NAME, userId);
    if (!user) {
      throw new Error('User not found');
    }

    await setCurrentUser(user.id);
    return /*toLocalUserProxy(*/user/*)*/;
  },

  listUsers: async function (): Promise<StoredUser[]> {
    assertDB(db);
    const users = await db.getAll(AUTH_STORE_NAME);
    return users.map(user => /*toLocalUserProxy(*/user/*)*/);
  },

  updateUser: async function (userId: string, updates: Partial<StoredUser>): Promise<StoredUser> {
    assertDB(db);

    const user = await db.get(AUTH_STORE_NAME, userId);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = {
      ...user,
      ...updates,
      id: user.id, // Ensure ID can't be changed
      lastActive: new Date()
    };

    await db.put(AUTH_STORE_NAME, updatedUser);

    // If updating current user, notify listeners
    if (userId === currentUserId) {
      // notifyListeners(toLocalUserProxy(updatedUser));
    }

    return /*toLocalUserProxy(*/updatedUser/*)*/;
  },

  deleteUser: async function (userId: string): Promise<void> {
    assertDB(db);

    // Can't delete the current user
    if (userId === currentUserId) {
      throw new Error('Cannot delete current user');
    }

    await db.delete(AUTH_STORE_NAME, userId);
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
};

// #region UTILITIES

function assertDB(db: IDBPDatabase<AuthDB> | null): asserts db is IDBPDatabase<AuthDB> {
  if (!db) throw new Error("Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()");
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

async function getMostRecentUser(): Promise<StoredUser | null> {
  assertDB(db);

  // Get all users and sort by last_active
  const users = await db.getAll(AUTH_STORE_NAME);
  if (users.length === 0) return null;

  // Sort by lastActive descending
  users.sort((a, b) => {
    const dateA = new Date(a.last_active).getTime();
    const dateB = new Date(b.last_active).getTime();
    return dateB - dateA;
  });

  return users[0];
}


async function activateNewAnonymousUser(): Promise<StoredUser> {
  assertDB(db);

  const anonymousUser: StoredUser = {
    id: v4(),
    display_name: undefined, // Anonymous users have no display name
    last_active: new Date(),
    auth_provider: 'local',
    is_synced: false
  };

  await db.put(AUTH_STORE_NAME, anonymousUser);
  await setCurrentUser(anonymousUser.id);

  return /*toLocalUserProxy(*/anonymousUser/*)*/;
}
async function getAnonymousUser(): Promise<StoredUser | null> {
  assertDB(db);
  const users = await db.getAll(AUTH_STORE_NAME);
  return users.find(user => !user.display_name) || null;
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

// Combine all functionality
const api: LocalAuthAPI = {
  ...authOperations,
  // Re-export specific functions that might be needed directly
  activateNewAnonymousUser,
  getAnonymousUser,
  getMostRecentUser
};

export default localAuthProvider;

// Export for testing
export { db, currentUserId };