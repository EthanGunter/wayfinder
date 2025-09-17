import { v4 } from 'uuid';
import type { IAuth, IAuthLocalFunctions, ILocalAuthProvider, IAuthResponseHandler } from './types';
import { getDefaultUserFeatures, isAnonymous, userHasFeature, type User } from './User';
import type { ILocalTaskProvider, ILocalTasks, ITasks } from '../Tasks';
import { ACTIVEUSER_NAME as ACTIVEUSER_COLUMN_NAME, APP_TABLE_NAME, AUTH_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, ErrorType, InputRequiredError, InvalidStateError, NotFoundError, NotImplementedError } from '$lib/Errors';
import { extractBatchAndLogErrors } from '../types';
import { invalidateAll } from '$app/navigation';
// import { queueAuthSyncCommand } from './types';
// import { processQueueInClient } from '../SyncQueue';
import BrowserTaskProvider from '../Tasks/BrowserTaskProvider';

// TODO: Force UI to update at appropriate times. onAuthChange callback might be required rather than using invalidateAll()
let db: LocalDB | null = null;
let _remoteAuth: IAuth | null = null;
let _tasks: ITasks | null = null;

const BrowserAuthProvider: ILocalAuthProvider = {
  get: async function (
    remoteAuth?: IAuth,
  ) {
    db = await dbPromise;

    // Initialize with active user or create anonymous
    const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    // TODO:Temp anonymous accounts disabled
    /*
    if (!activeUserId) {
      const anonRes = await local.getDefaultUser();
      if (anonRes.isOk()) {
        await local.switchUser(anonRes.value.id);
      }
    } 
    */

    if (remoteAuth) {
      // Lazily acquire local tasks provider; used for local data detection and migration
      try {
        const localTasks = await BrowserTaskProvider.get();
        _tasks = localTasks;
      } catch {
        _tasks = null;
      }

      _remoteAuth = remoteAuth;

    }

    return { ...auth, ...local };
  },
};

export default BrowserAuthProvider;

const local: IAuthLocalFunctions = {
  hasRemote: () => !!_remoteAuth,

  createUser: async function ({ user }) {
    assertDB(db);

    await db.put(AUTH_TABLE_NAME, user);
    return ok(user);
  },

  register: async function ({ creds, userData }) {
    if (isAnonymous(userData)) {
      return err(new InvalidStateError("Cannot register an account with 'anonymous' id", userData))
    }

    const reqsResult = auth.getRegistrationRequirements(creds);
    if (reqsResult.isErr()) {
      return err(reqsResult.error);
    } else if (reqsResult.value.length > 0) {
      return err(new ArgumentError(creds, `Registration credentials had errors. Make sure to call getRegistrationRequirements() before register()`));
    }

    assertDB(db);
    assertRemoteAuth(_remoteAuth, `Cannot register without remote auth provider`);
    // We allow registration without a tasks provider, but if migration is needed later, we'll require tasks

    // Check if there's an anonymous user with local data that needs migration
    const currentUser = await local.getActiveUser();
    // TODO:Temp anonymous accounts disabled
    const hasAnonymousWithData = false /* currentUser &&
      isAnonymous(currentUser) &&
      await _hasLocalData(currentUser.id); 
      */

    // Create the new account on the server
    const registerResult = await _remoteAuth.register({ creds, userData });
    if (registerResult.isErr()) {
      return err(registerResult.error);
    }
    const registeredUser = registerResult.value;

    // Create local user with registered user data
    await db.put(AUTH_TABLE_NAME, registeredUser);

    // TODO:Temp anonymous accounts disabled
    /* 
    if (hasAnonymousWithData && currentUser) {
      if (!_tasks) {
        return err(new InputRequiredError(
          "Anonymous user has local data, but migration is unavailable (no tasks remote).",
          { requiresMigration: true, anonymousUserId: currentUser.id, canMigrate: false }
        ));
      }
      const changeResult = await _tasks.changeOwnership({
        oldUserID: currentUser.id,
        newUserID: registeredUser.id
      });
      if (changeResult.isErr()) {
        // Log the error but don't fail the registration
        Err.UNHANDLED(changeResult.error, 'Failed to change task ownership during registration:');
      } 
      
        // Remove the anonymous user since data has been migrated
        await db.delete(AUTH_TABLE_NAME, currentUser.id);
      }
      */

    // Switch to the new representation of the user
    await local.switchUser(registeredUser.id);

    return ok(registeredUser);
  },
  removeUser: async function (userId) {
    assertDB(db);

    await db.delete(AUTH_TABLE_NAME, userId);
  },

  listUsers: async function () {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    return users;
  },

  switchUser: async function (newUserId) {
    if (!newUserId || newUserId == '') Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use signOut if you want no active user"));

    const active = await this.getActiveUser();
    if (newUserId == active?.id) return ok(active);

    assertDB(db);
    // Update last active time
    const user = await db.get(AUTH_TABLE_NAME, newUserId);
    if (user) {
      await db.put(APP_TABLE_NAME, newUserId, ACTIVEUSER_COLUMN_NAME);
      await db.put(AUTH_TABLE_NAME, user);
      return ok(user);
    } else {
      return err(new NotFoundError(newUserId, "User"));
    }
  },

  getDefaultUser: async function () {
    assertDB(db);
    const users = await db.getAll(AUTH_TABLE_NAME);
    if (users.length === 0) {
      // TODO:Temp anonymous accounts disabled
      return err(new InvalidStateError("There are too many users to select a default"));
      /* 
      // Only create the anonymous user the first time
      const userData: User = {
        id: 'anonymous',
        display_name: 'Anonymous',
        created_at: new Date().toISOString(),
        status: 'active',
        features: getDefaultUserFeatures(),
      };


      await db.put(AUTH_TABLE_NAME, userData);
      return ok(userData); 
      */
    } else if (users.length === 1) {
      const userData = users[0];
      return ok(userData);
    } else {
      return err(new InvalidStateError("There are too many users to select a default"));
    }
  },

  getActiveUser: async function () {
    assertDB(db);
    const activeId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (activeId) {
      const user = await db.get(AUTH_TABLE_NAME, activeId);
      return user ?? null;
    } else return null;
  },
};


const auth: Omit<IAuth, "register"> & IAuthResponseHandler = {
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

  updateUser: async function ({ update }) {
    assertDB(db);

    // const oldId = update.oldId ?? update.id; // TODO This should be its own local function

    const user = await db.get(AUTH_TABLE_NAME, update.id);
    if (!user) {
      Err.throw(new NotFoundError(update.id, "User"));
    }

    const updatedUser = {
      ...user,
      ...update,
    };

    await db.put(AUTH_TABLE_NAME, updatedUser);

    /* // TODO: This is an invalid gate. A user can't update their account info if they aren't paying for task sync??
        if (userHasFeature(user, 'task-sync')) {
          await queueAuthSyncCommand('updateUser', { update }, { oldUser: user }); */
    // Directly call remote auth provider if available
    if (_remoteAuth) {
      const response = await _remoteAuth.updateUser({ update });
      if (response.isErr()) {
        // Undo changes locally if remote failed
        assertDB(db);
        await db.put(AUTH_TABLE_NAME, user);
        return err(response.error);
      }
    }

    return ok(updatedUser);
  },
  handleUpdateUserResponse: async function (response) {
    if (response.isErr()) {
      const { oldUser } = response.error;
      // Undo changes
      assertDB(db);
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
        await this.logout();
      }

      await db.delete(AUTH_TABLE_NAME, userId);

      /* // TODO: This is an invalid gate. A user can't update their account info if they aren't paying for task sync??
      if (userHasFeature(user, 'task-sync')) {
        await queueAuthSyncCommand('deleteUser', { userId }, { oldUser: user });
      } */
      // Directly call remote auth provider if available
      if (_remoteAuth) {
        const response = await _remoteAuth.deleteUser({ userId });
        if (response.isErr()) {
          // Restore user locally if remote failed
          assertDB(db);
          await db.put(AUTH_TABLE_NAME, user);
          return err(response.error);
        }
      }
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

  getRegistrationRequirements: function (signUpCred) {
    assertRemoteAuth(_remoteAuth, "Cannot check registration without a provided remote auth provider");
    return _remoteAuth.getRegistrationRequirements(signUpCred);
  },

  /*   handleRegisterResponse: async function (response) {
      assertDB(db);
  
      if (response.isErr()) {
        const { creds, lastLoggedIn, oldUser } = response.error;
        // If failed, switch back to the old user
        lastLoggedIn ?
          await api.switchUser(lastLoggedIn) : await api.logout();
  
        // Revert the user info
        await db.put(AUTH_TABLE_NAME, oldUser);
  
        // TODO Let the user know that registration failed
      } else {
        const { oldUser, registeredUser } = response.value;
  
        local.migrateRegisteredUser({ oldUser, registeredUser })
      }
  
      Err.throw(new NotImplementedError("BrowserAuth.handleRegisterResponse"))
    }, */

  login: async function ({ creds }) {
    assertDB(db);
    assertRemoteAuth(_remoteAuth);



    // Proceed with remote login
    const loginResult = await _remoteAuth.login({ creds });
    if (loginResult.isErr()) {
      return err(loginResult.error);
    }
    // Check if current user is anonymous and has local data
    // TODO:Temp anonymous accounts disabled
    /* 
    const currentUser = await local.getActiveUser();
    if (currentUser && isAnonymous(currentUser)) {
      const hasLocalData = await _hasLocalData(currentUser.id);

      if (hasLocalData) {
        // Anonymous user has local data - need migration decision
        // Return special result indicating migration is needed, include remote user id for UI to complete
        return err(new InputRequiredError(
          "Anonymous user has local data. Migration decision required before login.",
          { requiresMigration: true, anonymousUserId: currentUser.id, remoteUserId: loginResult.value.id, canMigrate: !!_tasks }
        ));
      } else {
        // Anonymous user has no local data - can proceed with login
        // First remove the anonymous user
        await db.delete(AUTH_TABLE_NAME, currentUser.id);
        await db.put(APP_TABLE_NAME, undefined, ACTIVEUSER_COLUMN_NAME);
      }
    } 
    */

    const remoteUser = loginResult.value;

    // Create local user with remote user data
    await db.put(AUTH_TABLE_NAME, remoteUser);

    // Switch to the logged in user
    await local.switchUser(remoteUser.id);

    // Hydrate tasks for this user if local tasks provider is available
    try {
      const tasks = await BrowserTaskProvider.get();
      if ((tasks as any).hydrateForUser) {
        await (tasks as any).hydrateForUser({ user: remoteUser });
      }
    } catch {}

    /* // After login, try processing the queue so prior offline work flushes
    try { await processQueueInClient(); } catch (e) { Err.UNHANDLED(e); } */

    return ok(remoteUser);
  },

  logout: async function () {
    assertDB(db);
    await db.delete(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME);
    try { await _remoteAuth?.logout(); } catch { /* offline or already invalid */ }
    invalidateAll();
    return ok();
  },
  ...local
}

// Helper function to check if a user has local data
async function _hasLocalData(userId: string): Promise<boolean> {
  // TODO:Temp anonymous accounts disabled; treat as no local data
  return false;
  /*
   if (!_tasks) return false;

  try {
    const result = await _tasks.getAllUserTasks({ userId });
    if (result.isOk()) {
      const tasks = extractBatchAndLogErrors(result);
      return tasks.length > 0;
    }
    return false;
  } catch {
    // If we can't get tasks, assume no local data
    return false;
  }
 */
}

// #region UTILITIES

function assert(
  condition: unknown,
  message?: string
): asserts condition {
  if (!condition) {
    throw new Error(message ?? "Assertion failed");
  }
}

function assertDB(db: LocalDB | null, errorMessage?: string): asserts db is LocalDB {
  if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use LocalAuthProvider without a db connection. Make sure to call .get()"));
}
function assertRemoteAuth(remoteAuth: IAuth | null, errorMessage?: string): asserts remoteAuth is IAuth {
  if (!remoteAuth) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote auth without a provider."));
}
function assertTasks(remoteTasks: ITasks | null, errorMessage?: string): asserts remoteTasks is ITasks {
  if (!remoteTasks) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote tasks without a provider."));
}
// #endregion

