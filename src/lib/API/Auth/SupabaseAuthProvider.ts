import supabase from '$lib/API/SupabaseClient'
import { err, ok } from 'neverthrow';
import {
    AccountIssueTarget,
    type IAuth,
    type MigrationRequirements,
} from './types';
import { type IProvider } from '../types';
import type { AuthError, UserAttributes } from '@supabase/auth-js';
import { NotFoundError, Err, NotImplementedError, ArgumentError, ErrorType, InvalidStateError } from '$lib/Errors';
import { type User } from './User';
import type { Tables, TablesInsert } from '../supabase';

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
        // First, create the user in auth.users (this handles email/password)
        const authRes = await supabase.auth.signUp({
            email: creds.email,
            password: creds.password,
        });

        if (authRes.error) {
            console.log(authRes.error);

            switch (authRes.error.code) {
                case 'invalid_credentials':
                case 'user_already_exists':
                    return err(new SupabaseAuthError(authRes.error));

                default:
                    Err.UNHANDLED(authRes.error);
            }
        }

        if (!authRes.data.user) {
            Err.UNHANDLED("supabase.auth.signUp returned a null user");
        }

        // Then, create the user record in our public.users table
        const userInsert: TablesInsert<'users'> = {
            id: authRes.data.user.id,
            display_name: userData.display_name,
            avatar_url: userData.avatar_url,
            created_at: authRes.data.user.created_at,
            status: 'active',
            features: userData.features,
        };

        const { data: inserted, error: insertError } = await supabase
            .from('users')
            .insert(userInsert)
            .select('*')
            .single();

        if (insertError) {
            // If we can't create the user record, we should clean up the auth user
            // TODO: Implement cleanup of auth user if public.users insert fails
            Err.UNHANDLED(insertError);
        }

        const created: User = {
            id: inserted!.id,
            display_name: inserted!.display_name,
            avatar_url: inserted!.avatar_url ?? undefined,
            created_at: inserted!.created_at,
            status: (inserted!.status ?? 'active') as User['status'],
            features: inserted!.features ?? [],
        };
        return ok(created);
    },

    getUser: async function ({ id }) {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (userError || !userData) {
            return err(new NotFoundError(id, "User"));
        }

        // Check if user is deleted
        if (userData.status === 'deleted') {
            return err(new NotFoundError(id, "User account has been deleted"));
        }

        const mapped: User = {
            id: userData.id,
            display_name: userData.display_name,
            avatar_url: userData.avatar_url ?? undefined,
            created_at: userData.created_at,
            status: (userData.status ?? 'active') as User['status'],
            features: userData.features ?? [],
        };
        return ok(mapped);
    },

    updateUser: async function ({ update }) {
        // First, get the current user to check their status
        const { data: currentUser, error: currentUserError } = await supabase
            .from('users')
            .select('*')
            .eq('id', update.id)
            .single();

        if (currentUserError || !currentUser) {
            return err(new NotFoundError(update.id, "User"));
        }

        // Check if user is deleted
        if (currentUser.status === 'deleted') {
            return err(new NotFoundError(update.id, "Cannot update deleted user account"));
        }

        // Update the user in our public.users table
        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
                display_name: update.display_name,
                avatar_url: update.avatar_url,
                // features: update.features, // Should not be allowed to update their own features, right?
                status: update.status,
            })
            .eq('id', update.id)
            .select('*')
            .single();

        if (updateError || !updatedUser) {
            return err(new NotFoundError(update.id, "User"));
        }

        const mapped: User = {
            id: updatedUser.id,
            display_name: updatedUser.display_name,
            avatar_url: updatedUser.avatar_url ?? undefined,
            created_at: updatedUser.created_at,
            status: (updatedUser.status ?? 'active') as User['status'],
            features: updatedUser.features ?? [],
        };
        return ok(mapped);
    },

    // TODO Need to update all access to check for deleted users
    deleteUser: async function ({ userId }) {
        // First, mark for deletion in our public.users table
        const updateResult = await this.updateUser({ update: { id: userId, status: "deleted" } });

        if (updateResult.isErr()) {
            return err(updateResult.error);
        }

        // The official deletion will be managed by admin on the backend

        return ok();
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

                    // Get user data from our public.users table
                    const { data: userData, error: userError } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', user.id)
                        .single();

                    if (userError || !userData) {
                        // User exists in auth but not in our users table - this shouldn't happen
                        // but we'll handle it gracefully
                        return err(new NotFoundError(user.id, "User"));
                    }

                    // Check if user is deleted
                    if (userData.status === 'deleted') {
                        return err(new ArgumentError(user.id, "User account has been deleted"));
                    }

                    const mapped: User = {
                        id: userData.id,
                        display_name: userData.display_name,
                        avatar_url: userData.avatar_url ?? undefined,
                        created_at: userData.created_at,
                        status: (userData.status ?? 'active') as User['status'],
                        features: userData.features ?? [],
                    };
                    return ok(mapped);
                }
            }
            default: Err.throw(new NotImplementedError(`SupabaseAuth.${creds.type} sign-in`));
        }
    },

    logout: async function () {
        const error = await supabase.auth.signOut();
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


export class SupabaseAuthError extends Err {
    code: AuthError['code'];

    constructor(error: AuthError, context?: any) {
        super(1, ErrorType.ArgumentError, error.message, { error, context });
        this.code = error.code;
    }
}