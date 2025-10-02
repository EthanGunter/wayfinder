import { type IAuth, type IAuthLocal, isSessionCapable, type AuthState } from './types';
import { isAnonymous, type LocalUser, type User } from './User';
import { tasksAPI } from '../Tasks';
import { ACTIVEUSER_NAME as ACTIVEUSER_COLUMN_NAME, APP_TABLE_NAME, USER_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, ErrorType, InputRequiredError, InvalidStateError, NotFoundError } from '$lib/Errors';
import SessionVault from './SessionVault';
import { writable, type Readable, get } from 'svelte/store';
import { remoteAuth } from '$lib/stores/remoteAuth';

// Stores
const _authState = writable<AuthState>({ status: "loading" });
const _users = writable<LocalUser[]>([]);

export const browserAuthState: Readable<AuthState> = _authState;
export const browserCachedUsers: Readable<LocalUser[]> = _users;

// Module state
let db: LocalDB | null = null;
let _remoteAuth: IAuth | null = null;

// Module-load hydration
(async () => {
  try {
    db = await dbPromise;

    // Hydrate users list
    const allUsers = await db.getAll(USER_TABLE_NAME) as LocalUser[];
    _users.set(allUsers);

    // Hydrate active user state
    const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeUserId) {
      const activeUser = await db.get(USER_TABLE_NAME, activeUserId) as LocalUser | undefined;
      if (activeUser) {
        _authState.set({ status: "signed-in", user: activeUser });
      } else {
        _authState.set({ status: "signed-out", user: null });
      }
    } else {
      _authState.set({ status: "signed-out", user: null });
    }

    // Subscribe to remote auth store when it's created (like remoteTasks pattern)
    try {
      _remoteAuth = get(remoteAuth);
      const state = get(_authState);
      if (state.status === 'signed-in') {
        const merged = await _fetchAndPersistLatestUser(state.user);
        _authState.set({ status: 'signed-in', user: merged });
      }
    } catch {
      // remoteAuth store doesn't exist yet; will remain null
    }
  } catch (e: any) {
    _authState.set({ status: "error", error: Err.wrap(e) });
  }
})();

const api: IAuthLocal = {
  register: async ({ creds, userData }) => {
    if (isAnonymous(userData)) {
      return err(new InvalidStateError("Cannot register an account with 'anonymous' id", userData))
    }

    const reqsResult = api.getRegistrationRequirements(creds);
    if (reqsResult.isErr()) {
      return err(reqsResult.error);
    } else if (reqsResult.value.length > 0) {
      return err(new ArgumentError(creds, `Registration credentials had errors. Make sure to call getRegistrationRequirements() before register()`));
    }

    assertDB(db);
    assertRemoteAuth(_remoteAuth, `Cannot register without remote auth provider`);

    // Create the new account on the server
    const registerResult = await _remoteAuth.register({ creds, userData });
    if (registerResult.isErr()) {
      if (registerResult.error.type === ErrorType.InvalidState) {
        // TODO:DX Invalid state doesn't clearly guarantee the user is already registered...
        // Attempt to log the user in with the account
        const logRes = await api.login({ creds });
        if (logRes.isOk()) return ok(logRes.value);
      }
      return err(registerResult.error);
    }
    const registeredUser = registerResult.value;

    // Create local user with registered user data
    await db.put(USER_TABLE_NAME, registeredUser);
    await _refreshUsers();

    // Switch to the new user
    await api.switchUser(registeredUser.id);

    return ok(registeredUser);
  },

  removeCachedUser: async (userId: string): Promise<void> => {
    assertDB(db);
    await db.delete(USER_TABLE_NAME, userId);
    await _refreshUsers();
  },

  getUser: async () => {
    assertDB(db);
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeId) {
      const activeUser = await db.get(USER_TABLE_NAME, activeId);
      if (activeUser) {
        return ok(activeUser);
      }
    }

    return err(new InvalidStateError("No active user"));
  },

  switchUser: async (newUserId: string) => {
    if (!newUserId || newUserId == '') Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use signOut if you want no active user"));

    // Check if already active
    assertDB(db);
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (newUserId === activeId) {
      const user = await db.get(USER_TABLE_NAME, activeId) as LocalUser | undefined;
      return user ? ok(user) : err(new NotFoundError(newUserId, "User"));
    }

    let user = await db.get(USER_TABLE_NAME, newUserId) as LocalUser | undefined;
    if (!user) {
      return err(new NotFoundError(newUserId, "User"));
    }

    // Attempt to restore remote session using capability + SessionVault
    if (_remoteAuth && isSessionCapable(_remoteAuth)) {
      try {
        let material = await SessionVault.get(newUserId);
        if (!material) {
          // Fallback: probe remote for current session (e.g., right after login just occurred)
          const probe = await _remoteAuth.getSessionMaterial({ userId: newUserId });
          if (probe.isOk() && probe.value) {
            material = probe.value;
            await SessionVault.save(newUserId, material);
          }
        }
        if (material) {
          const res = await _remoteAuth.restoreSession({ userId: newUserId, material });
          if (res.isErr()) {
            return err(new InputRequiredError('Session expired. Please log in again.', { userId: newUserId }));
          }
          const rotated = res.value.rotatedMaterial;
          if (rotated && rotated !== material) {
            await SessionVault.save(newUserId, rotated);
          }
        } else {
          return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
        }
      } catch {
        return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
      }
    }

    // Before switching locally, try to refresh from remote to pick up new features/status/etc
    if (_remoteAuth) {
      user = await _fetchAndPersistLatestUser(user);
    }

    // Switch locally
    await db.put(APP_TABLE_NAME, newUserId, ACTIVEUSER_COLUMN_NAME);
    await db.put(USER_TABLE_NAME, user);

    // Update store
    _authState.set({ status: "signed-in", user });

    return ok(user);
  },

  getRegistrationRequirements: (signUpCred: any) => {
    assertRemoteAuth(_remoteAuth, "Cannot check registration without a provided remote auth provider");
    return _remoteAuth.getRegistrationRequirements(signUpCred);
  },

  updateUser: async ({ update }) => {
    assertDB(db);

    let userId;
    if (update.id) {
      userId = update.id;
    } else {
      const activeUserRes = await api.getUser();
      if (activeUserRes.isErr()) return err(activeUserRes.error);
      userId = activeUserRes.value.id;
    }

    const user = await db.get(USER_TABLE_NAME, userId) as LocalUser | undefined;
    if (!user) {
      return err(new NotFoundError(update.id, "User"));
    }

    // Skip if no real change (avoid redundant store writes/loops)
    const keys = Object.keys(update) as (keyof LocalUser)[];
    const noChange = keys.length === 0 || keys.every((k) => (update as LocalUser)[k] === user[k]);
    if (noChange) {
      return ok(user);
    }

    const updatedUser = {
      ...user,
      ...update,
    };

    await db.put(USER_TABLE_NAME, updatedUser);
    await _refreshUsers();

    // Update active user in store if this is the active user
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeId && activeId === updatedUser.id) {
      // TODO:?? I'm not sure it's a good idea to fetch the user EVERY update
      // // Ensure we reflect any server-side merges (e.g., sanitation, feature changes by admin)
      // const merged = _remoteAuth ? await _fetchAndPersistLatestUser(updatedUser as LocalUser) : (updatedUser as LocalUser);

      _authState.set({ status: "signed-in", user: updatedUser });
    }

    // Call remote auth provider if available
    if (_remoteAuth) {
      let updateWithId: Partial<User> & { id: string } = { ...update, id: userId };
      void _remoteAuth.updateUser({ update: updateWithId })
        .then(async (response) => {
          if (response.isErr()) {
            await api.handleUpdateUserResponse(err({ oldUser: user }));
          } else {
            await api.handleUpdateUserResponse(ok());
          }
        })
        .catch(async (error) => {
          await api.handleUpdateUserResponse(err({ oldUser: user }));
        });
    }

    return ok(updatedUser);
  },

  deleteUser: async ({ userId }) => {
    assertDB(db);

    const user = await db.get(USER_TABLE_NAME, userId) as LocalUser | undefined;

    if (user) {
      const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
      // Can't delete the current user
      if (userId === activeUserId) {
        await api.logout();
      }

      await db.delete(USER_TABLE_NAME, userId);
      await _refreshUsers();

      // Call remote auth provider if available
      if (_remoteAuth) {
        void _remoteAuth.deleteUser({ userId })
          .then((response) => {
            if (response.isErr()) {
              void api.handleDeleteUserResponse(err({ oldUser: user }));
            } else {
              void api.handleDeleteUserResponse(ok());
            }
          })
          .catch(() => {
            void api.handleDeleteUserResponse(err({ oldUser: user }));
          });
      }
    }

    return ok();
  },

  handleDeleteUserResponse: async (response: any) => {
    if (response.isErr()) {
      const { oldUser } = response.error;
      assertDB(db);
      await db.put(USER_TABLE_NAME, oldUser);
      await _refreshUsers();
    }
  },
  handleUpdateUserResponse: async (response: any) => {
    if (response.isErr()) {
      const { oldUser } = response.error;
      // Undo changes
      assertDB(db);
      await db.put(USER_TABLE_NAME, oldUser);
      await _refreshUsers();

      const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
      if (activeId && activeId === oldUser.id) {
        _authState.set({ status: "signed-in", user: oldUser });
      }
    }
  },

  login: async ({ creds }) => {
    assertDB(db);
    assertRemoteAuth(_remoteAuth);

    // Proceed with remote login
    const loginResult = await _remoteAuth.login({ creds });
    if (loginResult.isErr()) {
      return err(loginResult.error);
    }

    const remoteUser = loginResult.value;

    // Create local user with remote user data
    await db.put(USER_TABLE_NAME, remoteUser);
    await _refreshUsers();

    // Persist session material BEFORE switching so switchUser can restore remote session if needed
    if (_remoteAuth && isSessionCapable(_remoteAuth)) {
      try {
        const materialRes = await _remoteAuth.getSessionMaterial({ userId: remoteUser.id });
        if (materialRes.isOk() && materialRes.value) {
          await SessionVault.save(remoteUser.id, materialRes.value);
        }
      } catch { }
    }

    // Switch to the logged in user
    await api.switchUser(remoteUser.id);

    // Hydrate tasks for this user
    await tasksAPI.hydrateForUser({ user: remoteUser });

    return ok(remoteUser);
  },

  logout: async () => {
    assertDB(db);
    // Capture who is being logged out before clearing active marker
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    try {
      // Invalidate remote session
      await _remoteAuth?.logout();
    } catch { /* offline or already invalid */ }
    if (activeId) {
      await SessionVault.remove(activeId);
    }
    await db.delete(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME);

    // Update store
    _authState.set({ status: "signed-out", user: null });
    return ok();
  }
}
export default api;

// #region UTILITIES

// Fetch the latest remote user row and persist/merge into local DB
async function _fetchAndPersistLatestUser(current: LocalUser): Promise<LocalUser> {
  assertDB(db);
  if (!_remoteAuth) {
    return current;
  }
  const res = await _remoteAuth.getUser({ id: current.id });
  if (res.isErr()) {
    Err.UNHANDLED(res.error);
    return current;
  }

  const remoteUser = res.value;
  const merged: LocalUser = { ...current, ...remoteUser };
  await db.put(USER_TABLE_NAME, merged);
  await _refreshUsers();
  return merged;
}

// Helper to refresh users list from DB
async function _refreshUsers(): Promise<void> {
  assertDB(db);
  const allUsers = await db.getAll(USER_TABLE_NAME) as LocalUser[];
  _users.set(allUsers);
}

function assertDB(db: LocalDB | null, errorMessage?: string): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()"));
}
function assertRemoteAuth(remoteAuth: IAuth | null, errorMessage?: string): asserts remoteAuth is IAuth {
  if (!remoteAuth) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote auth without a provider."));
}


// #endregion

