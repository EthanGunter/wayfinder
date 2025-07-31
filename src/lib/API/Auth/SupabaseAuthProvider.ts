import supabase from '$lib/API/SupabaseClient'
import { err, ok } from 'neverthrow';
import {
    AccountIssueTarget,
    type IAuth,
    type MigrationRequirements,
    type SignInCredentials,
    type SignOutOptions,
    type LocalUser,
} from './types';
import type { ITaskAPI, Task } from '../Tasks';
import type { UserAttributes } from '@supabase/supabase-js';
import { NotFoundError, Err, InvalidStateError, NotImplementedError, NotHandledError } from '$lib/Errors';
import { extractBatchAndLogErrors, type IProvider } from '../types';

const core: IAuth = {
    getRegistrationRequirements: function (cred) {
        const issues: MigrationRequirements[] = [];

        switch (cred.type) {
            case "email_password":
                if (!cred.email || cred.email == '') {
                    issues.push({ target: AccountIssueTarget.email, message: "Email required" });
                } else if (!cred.email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+[.][A-Za-z.]{2,}$/)) {
                    issues.push({ target: AccountIssueTarget.email, message: "Email format invalid" });
                }

                if (!cred.password) {
                    issues.push({ target: AccountIssueTarget.password, message: "Password required" });
                } else if (cred.password.length < 8) {
                    issues.push({ target: AccountIssueTarget.password, message: "Password must be at least 8 characters" });
                }
                break;
            default: return err(new NotImplementedError(`SupabaseAuth.migrate => ${cred.type}`));
        }

        return ok(issues);
    },

    register: async function ({ creds, userData: userData }) {
        const authRes = await supabase.auth.signUp({
            email: creds.email,
            password: creds.password,
            options: {
                data: userData,
            }
        })
        if (authRes.error) { Err.throw(new NotHandledError(authRes.error)); }

        if (authRes.data.user) {
            return ok(authRes.data.user);
        } else Err.throw(new NotHandledError("supabase.auth.signUp returned a null user"));
    },

    getUser: function ({ id }) {
        Err.throw(new NotImplementedError("SupabaseAuthProvider.getUser"));
    },

    // TODO we may need this back...
    // getActiveUser: async function () {
    //     const userRes = await supabase.auth.getUser();
    //     if (userRes.error) {
    //         Err.throw(userRes.error); // TODO DEV ONLY
    //     } else {
    //         const user = userRes.data.user;
    //         return ok({
    //             id: user.id,
    //             display_name: user.user_metadata.displayName,
    //             avatar_url: user.user_metadata.avatarUrl,
    //         });
    //     }
    // },

    updateUser: async function ({ update }) {
        const updatedUser: UserAttributes = {
            // email: update.email,
            // password: update.password, // TODO This feels like it should be its own, more secure function
            data: {
                last_synced: update.last_synced,
                last_active: new Date(),
                display_name: update.display_name,
                avatar_url: update.avatar_url,
            }
        };

        const userResponse = await supabase.auth.updateUser(updatedUser);
        if (userResponse.error) {
            console.error(userResponse.error);
            return err(Err.wrap(userResponse.error));
        }

        if (!userResponse.data.user) {
            console.error();
            return err(new NotFoundError(update.display_name ?? update.id, "User"));
        }

        return ok(userResponse.data.user);

        // // If updating current user, notify listeners
        // if (update.id === currentUserId) {
        // notifyListeners(toLocalUserProxy(updatedUser));
        // }
    },

    deleteUser: async function ({ userId }) {
        // TODO deleting users requires admin access...
        // Common suggestion is to have a public.users/profiles table with a foreign-key constraint to auth.users...
        // Err.throw(new NotImplementedError("SupabaseAuth.deleteUser"));
        Err.throw(new NotImplementedError("SupabaseAuth.deleteUser"));
    },

    login: async function ({ creds }) {
        switch (creds.type) {
            case 'email_password': {
                const res = await supabase.auth.signInWithPassword({
                    email: creds.email,
                    password: creds.password,
                });
                if (res.error) {
                    console.error(res.error);
                } else {
                    const { session, user, weakPassword } = res.data;
                    return ok(user);
                }
            }
            default: Err.throw(new NotImplementedError(`SupabaseAuth.${creds.type} sign-in`));
        }
    },

    logout: async function (options?: SignOutOptions) {
        let scope: 'global' | 'local' | 'others' = options?.signOutSelf ? (options.signOutOthers ? 'global' : 'local') : 'others';
        const error = await supabase.auth.signOut({ scope });
        if (error.error) {
            Err.throw(error.error);
        }
        return ok();
    },

    // onAuthStateChanged: (callback: any): UnsubscribeFn => {
    //     const { data } = supabase.auth.onAuthStateChange(callback);
    //     return data.subscription.unsubscribe;
    // },
}

const migrator: IMigrator = {
    // TODO Convert to function* and yield progress results
    migrate: async function ({ user, signUpCred, taskProvider }) {
        const migNeedsRes = core.getRegistrationRequirements(signUpCred);
        if (migNeedsRes.isErr()) return err(migNeedsRes.error);
        else if (migNeedsRes.value.length > 0) return err(new InvalidStateError("Must resolve the following migration requirements before migrating", migNeedsRes.value));

        switch (signUpCred.type) {
            case "email_password":
                return migrateEmailPassword(user, signUpCred, taskProvider);
            default: return err(new NotImplementedError(`SupabaseAuth.migrate => ${signUpCred.type}`));
        }
    },
}

// TODO revert operations instead of simply throwing
async function migrateEmailPassword(user: LocalUser, creds: SignInCredentials, taskProvider: ITaskAPI) {
    console.log("Beginning email signup");

    // TODO Manage Supabase account migration
    const signUpRes = await supabase.auth.signUp(creds);
    if (signUpRes.error) {
        switch (signUpRes.error.code) {
            case 'identity_already_exists':
                return err(new InvalidStateError("Identity already exists", creds));
            case 'email_exists':
                return err(new InvalidStateError("Account with email already exists", creds.email));
            case 'user_already_exists':
                return err(new InvalidStateError("User already exists", creds));
            default: Err.throw(signUpRes.error);
        }
    }

    if (!signUpRes.data || !signUpRes.data.user) Err.throw("Supabase failed to return user data");
    const newUser = signUpRes.data.user;
    console.log("Email signup completed. Updating local user...");

    // Update local user
    const localAuth = await BrowserAuthProvider.get();
    localAuth.updateUser({ update: { ...newUser, last_synced: new Date() } });
    console.log("Local user updated. Updating local tasks...");

    // Update all task's user_id field for user
    const localTaskAPI = await BrowserTaskProvider.get();
    await localTaskAPI.changeOwnership({ oldUserID: user.id, newUserID: newUser.id });
    console.log("Local tasks updated. Copying tasks to remote...");

    // Copy all local tasks to the remote
    const locUserTasksResult = await localTaskAPI.getAllUserTasks({ userId: newUser.id });
    const localUserTasks = locUserTasksResult.match(tasks => extractBatchAndLogErrors(tasks), error => {
        Err.throw(error);
    });
    console.log("Tasks created. Matching remote to local...");

    const remoteTaskCreateResult = await taskProvider.createTasks({ createDetails: localUserTasks });
    const remoteTasks = remoteTaskCreateResult.match(tasks => extractBatchAndLogErrors(tasks), err => {
        Err.throw(err);
    });
    console.log("Tasks copied to remote. Syncing local tasks...");

    // In the event the remote has to generate new ids for conflict resolution,
    // update the local task set one last time
    let pairing: Map<Task, Task> = new Map();
    for (const remote of remoteTasks) {
        let index;
        const matchingTask = localUserTasks.find((t, ind) => {
            if (t.equals(remote, true)) {
                index = ind; return true;
            } else return false;
        });
        if (!matchingTask) Err.throw(new InvalidStateError("Failed to match remote task to local task during migration."))
        else
            pairing.set(matchingTask, remote);
    }
    localTaskAPI.updateTasks({
        updateList: Array.from(pairing).map(v => ({
            taskOrId: v[0], // local
            changes: v[1] // remote
        }))
    });
    console.log("Local tasks updated with remote changes. Returning new user:", user, "=>", newUser);

    return ok(newUser);
}


const SupabaseAuthProvider: IProvider<IAuthAPI> = {
    get: async () => ({ ...core, ...migrator }),
    close: async () => { },
}
export default SupabaseAuthProvider;