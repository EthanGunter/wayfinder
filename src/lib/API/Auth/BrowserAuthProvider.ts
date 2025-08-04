import { v4 } from 'uuid';
import type { IAuth, IAuthLocalFunctions, LocalUser, ILocalAuthProvider, IAuthLocal, IAuthResponseHandler, AuthSyncQueue, ILocalAuth } from './types';
import type { ILocalTaskProvider, ILocalTasks, ITaskAPI, TaskSyncQueue } from '../Tasks';
import { ACTIVEUSER_NAME as ACTIVEUSER_COLUMN_NAME, APP_TABLE_NAME, AUTH_TABLE_NAME as USER_TABLE_NAME, dbPromise, type LocalDB } from '../localDB';
import { err, ok } from 'neverthrow';
import { ArgumentError, Err, ErrorType, InvalidStateError, NotFoundError, NotImplementedError } from '$lib/Errors';
import { SyncQueue } from '../SyncQueue';
import { extractBatch, extractBatchAndLogErrors, type IProvider } from '../types';

// TODO: Force UI to update at appropriate times. onAuthChange callback might be required rather than using invalidateAll()

const auth: IAuthLocal = {
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


    _authSyncQueue!.add('updateUser',
      { update },
      'handleUpdateUserResponse',
      {
        oldUser: user,
      });

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

      _authSyncQueue!.add(
        'deleteUser',
        { userId },
        'handleDeleteUserResponse',
        { oldUser: user }
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

  getRegistrationRequirements: function (signUpCred) {
    assertRemoteAuth(_remoteAuth, "Cannot migrate without a provided remote auth provider");
    assertTasksProvider(_tasks, "Cannot migrate without a provided remote tasks provider");
    return _remoteAuth.getRegistrationRequirements(signUpCred);
  },

  register: async function ({ creds, userData }) {
    if (userData.last_synced) {
      return err(new InvalidStateError("Attempted to register a user that is already synced with a server", userData))
    }

    const reqsResult = this.getRegistrationRequirements(creds);
    if (reqsResult.isErr()) {
      return err(reqsResult.error);
    } else if (reqsResult.value.length > 0) {
      return err(new ArgumentError(creds, `Registration credentials had errors. Make sure to call getRegistrationRequirements() before register()`));
    }

    assertDB(db);
    assertRemoteAuth(_remoteAuth, `Cannot migrate without remote auth provider`);
    assertTasksProvider(_tasks, `Attempted account data migration without remote task provider. Aborting`);

    const registerResult = await _remoteAuth.register({ creds, userData });

    if (registerResult.isErr()) {
      return err(registerResult.error);
    }
    const registeredUser = registerResult.value;

    // Update the local user with registered user data
    await db.delete(USER_TABLE_NAME, userData.id);
    await db.put(USER_TABLE_NAME, { ...registeredUser, last_synced: new Date(), last_active: new Date() });

    // Update all task ids with new registered user id
    // TODO:Design This will probably queue an update with the server...
    const changeResult = await _tasks.changeOwnership({ oldUserID: userData.id, newUserID: registeredUser.id });
    if (changeResult.isErr()) {
      // TODO There's no handler for failed task migration after registration succeeds.
      // the tasks API will rollback any failures, but the registration process won't know...
    }
    const [userTasks, taskErrors] = extractBatch(changeResult);

    // TODO:Design So this may be redundant or dangerous...
    // taskSyncQueue.add(
    //   'createTasks', { createDetails: userTasks },
    //   'handleCreateTasksResponse', { createdIds: userTasks.map(t => t.id) }
    // );

    // Switch to the new representation of the user
    await local.switchUser(registeredUser.id);

    return ok(registeredUser);
  },

  /*   handleRegisterResponse: async function (response) {
      assertDB(db);
  
      if (response.isErr()) {
        const { creds, lastLoggedIn, oldUser } = response.error;
        // If failed, switch back to the old user
        lastLoggedIn ?
          await api.switchUser(lastLoggedIn) : await api.logout();
  
        // Revert the user info
        await db.put(USER_TABLE_NAME, oldUser);
  
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

    _authSyncQueue!.add(
      "login", {
      creds
    },
      'handleLoginResponse', {
      creds
    });

    // TODO I don't know how to handle login security locally...
    switch (creds.type) {
      default: return err(new ArgumentError(creds, `${creds.type} sign in not implemented for local auth`));
    }
  },
  handleLoginResponse: (response) => {
    Err.throw(new NotImplementedError("BrowserAuthProvider.handleLoginResponse"))
  },

  logout: async function () {
    assertDB(db);
    assertRemoteAuth(_remoteAuth);

    await db.put(APP_TABLE_NAME, undefined, ACTIVEUSER_COLUMN_NAME);

    _remoteAuth.logout();
    // invalidateAll(); // TODO I think notification is a better approach than invalidateAll()
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
  // },

  getSyncQueue() {
    return _authSyncQueue;
  },
}

const local: IAuthLocalFunctions = {
  createUser: async function ({ user }) {
    assertDB(db);

    await db.put(USER_TABLE_NAME, user);
    return ok(user);
  },

  removeUser: async function (userId) {
    assertDB(db);

    await db.delete(USER_TABLE_NAME, userId);
  },

  listUsers: async function () {
    assertDB(db);
    const users = await db.getAll(USER_TABLE_NAME);
    return users;
  },

  switchUser: async function (newUserId) {
    if (!newUserId || newUserId == '') Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use signOut if you want no active user"));

    const active = await this.getActiveUser();
    if (newUserId == active?.id) return ok(active);

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
      const newAnon: LocalUser = {
        id: v4(),
        display_name: undefined, // Anonymous users have no display name
        last_active: new Date(),
        auth_provider: 'local',
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
  },
};

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
function assertTasksProvider(remoteTasks: ITaskAPI | null, errorMessage?: string): asserts remoteTasks is ITaskAPI {
  if (!remoteTasks) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use Remote tasks without a provider."));
}
// #endregion

let db: LocalDB | null = null;
let _remoteAuth: IAuth | null = null;
let _authSyncQueue: AuthSyncQueue | null = null;
let _tasks: ITaskAPI | null = null;
let _taskSyncQueue: TaskSyncQueue | null = null;

const api: ILocalAuth = { ...auth, ...local }


const BrowserAuthProvider: ILocalAuthProvider = {
  get: async function (
    remoteAuth?: IAuth,
    tasks?: ILocalTasks,
  ) {
    db = await dbPromise;

    // Initialize with active user or create anonymous
    const activeUserId = await db.get(APP_TABLE_NAME, ACTIVEUSER_COLUMN_NAME) as string | undefined;
    if (!activeUserId) {
      const anonRes = await api.getDefaultUser();
      if (anonRes.isOk()) {
        await api.switchUser(anonRes.value.id);
      } else {
        // Multiple users and no-one's logged in. 
        // UI flow should just route to the login page.
      }
    }

    if (remoteAuth) {
      if (!tasks) {
        Err.throw(new InvalidStateError("Must provide task provider if remote auth provider is given", { wrappedAuthProvider: remoteAuth, wrappedTaskProvider: tasks }));
      } else {
        _tasks = tasks;
        _taskSyncQueue = tasks.getSyncQueue();
        if (!_taskSyncQueue)
          Err.throw(new InvalidStateError("Received remote auth provider, but received task provider does not have a remote"));
      }

      _remoteAuth = remoteAuth;

      _authSyncQueue = new SyncQueue<Omit<IAuth,
        | "getActiveUser"
        | "getRegistrationRequirements"
        | "getUser">, IAuthResponseHandler>({
          deleteUser: remoteAuth.deleteUser,
          handleDeleteUserResponse: auth.handleDeleteUserResponse,
          login: remoteAuth.login,
          handleLoginResponse: auth.handleLoginResponse,
          logout: remoteAuth.logout,
          register: remoteAuth.register,
          // handleRegisterResponse: auth.handleRegisterResponse,
          updateUser: remoteAuth.updateUser,
          handleUpdateUserResponse: auth.handleUpdateUserResponse,
        });

    }

    return api;
  },
};

export default BrowserAuthProvider;