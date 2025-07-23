import supabase from '$lib/API/SupabaseClient'
import { err, ok, type Result } from 'neverthrow';
import {
    AccountIssueTarget,
    type IAuthCore,
    type IAuthProvider,
    type IMigrationProvider,
    type MigrationRequirements,
    type SignInCredentials,
    type SignOutOptions,
    type StoredUser,
    type UnsubscribeFn,
    type User,
    type UserData,
} from './types';
import type { IProvider } from '../Tasks';
import type { UserAttributes } from '@supabase/supabase-js';
import { NotFoundError, Err, InvalidStateError, IOError, type UnknownError, NotImplementedError, NotHandledError, ArgumentError } from '$lib/Errors';

const core: IAuthCore = {
    signUp: async function (creds: SignInCredentials, userData: UserData): Promise<Result<User, UnknownError>> {
        const authRes = await supabase.auth.signUp({
            email: creds.email,
            password: creds.password,
            options: {
                data: userData,
            }
        })
        if (authRes.error) { throw new NotHandledError(authRes.error); }

        if (authRes.data.user) {
            return ok(authRes.data.user);
        } else throw new NotHandledError("supabase.auth.signUp returned a null user");
    },

    getUser: function (id: string): Promise<Result<User, NotFoundError>> {
        throw new Error('Function not implemented.');
    },

    getCurrentUser: async function (): Promise<Result<User, InvalidStateError | UnknownError>> {
        const userRes = await supabase.auth.getUser();
        if (userRes.error) {
            throw userRes.error; // TODO DEV ONLY
        } else {
            const user = userRes.data.user;
            return ok({
                id: user.id,
                display_name: user.user_metadata.displayName,
                avatar_url: user.user_metadata.avatarUrl,
            });
        }
    },

    updateUser: async function (update: Partial<StoredUser> & { id: string; }): Promise<Result<User, Err>> {
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

    deleteUser: async function (userId: string): Promise<Result<void, UnknownError>> {
        // TODO deleting users requires admin access...
        // Common suggestion is to have a public.users/profiles table with a foreign-key constraint to auth.users...
        // Err.throw(new NotImplementedError("SupabaseAuth.deleteUser"));
        throw new NotImplementedError("SupabaseAuth.deleteUser");
    },

    signIn: async (cred: SignInCredentials): Promise<any> => {
        switch (cred.type) {
            case 'email_password': {
                const res = await supabase.auth.signInWithPassword({
                    email: cred.email,
                    password: cred.password,
                });
                if (res.error) {
                    console.error(res.error);
                } else return res.data;
            }
            default: throw new Error(`${cred.type} sign-in method not implemented`);
        }
    },

    signOut: async (options?: SignOutOptions): Promise<Result<void, Err>> => {
        let scope: 'global' | 'local' | 'others' = options?.signOutSelf ? (options.signOutOthers ? 'global' : 'local') : 'others';
        const error = await supabase.auth.signOut({ scope });
        if (error.error) {
            throw error.error
        }
        return ok();
    },

    onAuthStateChanged: (callback: any): UnsubscribeFn => {
        const { data } = supabase.auth.onAuthStateChange(callback);
        return data.subscription.unsubscribe;
    },
}

const migrator: IMigrationProvider = {
    getMigrationNeeds: function (cred) {
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

    // TODO Convert to function* and yield progress results
    migrate: async function (user, creds) {
        const migNeedsRes = supabaseAuth.getMigrationNeeds(creds);
        if (migNeedsRes.isErr()) return err(migNeedsRes.error);
        else if (migNeedsRes.value.length > 0) return err(migNeedsRes.value);

        switch (creds.type) {
            case "email_password":
                // TODO Manage Supabase account migration
                console.log("Mocking Supabase migration");
                // await sup
                break;
            default: return err(new NotImplementedError(`SupabaseAuth.migrate => ${creds.type}`));
        }
        Err.throw(new NotImplementedError("SupabaseAuth.migrate"))
    },
}

const supabaseAuth: IAuthProvider = {
    ...core,
    ...migrator
}

const provider: IProvider<IAuthProvider> = {
    get: async () => supabaseAuth,
    close: async () => { },
}
export default provider;