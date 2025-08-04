import supabase from '$lib/API/SupabaseClient'
import { err, ok } from 'neverthrow';
import {
    AccountIssueTarget,
    type IAuth,
    type MigrationRequirements,
    type SignOutOptions,
} from './types';
import { type IProvider } from '../types';
import type { AuthError, UserAttributes } from '@supabase/supabase-js';
import { NotFoundError, Err, NotImplementedError, NotHandledError, ArgumentError } from '$lib/Errors';

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
        if (authRes.error) {
            switch (authRes.error.code) {
                case 'invalid_credentials':
                    return err(new ArgumentError(creds, authRes.error.message));
                default:
                    Err.throw(new NotHandledError(authRes.error));
            }
        }

        if (authRes.data.user) {
            return ok(authRes.data.user);
        } else Err.throw(new NotHandledError("supabase.auth.signUp returned a null user"));
    },

    getUser: function ({ id }) {
        // TODO How do I get the JWT from supabase?
        // supabase.auth.getUser()
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
        if (userResponse.error?.code === 'user_not_found' || !userResponse.data.user) {
            return err(new NotFoundError(update.display_name ?? update.id, "User"));
        } else if (userResponse.error)
            return Err.throw(new NotHandledError(userResponse.error));

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
                    switch (res.error.code) {
                        case 'invalid_credentials':
                        case 'user_not_found':
                            return err(new ArgumentError(creds, res.error.message));
                        default:
                            Err.throw(res.error);
                    }
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


const SupabaseAuthProvider: IProvider<IAuth> = {
    get: async () => core,
}
export default SupabaseAuthProvider;