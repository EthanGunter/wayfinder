import { NotFoundError, Err, NotImplementedError, ArgumentError, InvalidStateError, IOError } from '$domain/errors';
import { err, ok } from '$domain/result';
import { type IAuth, type RegistrationRequirements, AccountIssueTarget, type IAuthSessionCapable, type User } from '$domain/models/user';
import type { Database, TablesInsert } from '../supabase';
import { createClient } from '@supabase/supabase-js';
import { USER_TABLE_NAME } from '../DBConstants';
import { PUBLIC_SUPABASE_API_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';


//#region Supabase Connection


const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = PUBLIC_SUPABASE_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseKey) missing.push('SUPABASE_API_KEY');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

//#endregion


const api: IAuth = {
    getRegistrationRequirements: function (cred) {
        const issues: RegistrationRequirements[] = [];

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

    register: async function ({ creds, userData }) {
        // First, create the user in auth.users (this handles email/password)
        const authRes = await supabase.auth.signUp({
            email: creds.email,
            password: creds.password,
        });

        if (authRes.error) {
            console.log(authRes.error);

            switch (authRes.error.code) {
                case 'user_already_exists':
                    return err(new ArgumentError("[Supabase] User already registered", authRes.error.code));
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
            display_name: userData.displayName,
            avatar_url: userData.avatarUrl,
            created_at: authRes.data.user.created_at,
            status: 'active',
            features: userData.features,
        };

        const { data: inserted, error: insertError } = await supabase
            .from(USER_TABLE_NAME)
            .insert(userInsert)
            .select('*')
            .single();

        if (insertError) {
            return err(new IOError("Remote failed to add user to DB", insertError, { creds, userData }));
        }

        const created: User = {
            id: inserted!.id,
            displayName: inserted!.display_name,
            avatarUrl: inserted!.avatar_url ?? undefined,
            createdAt: inserted!.created_at,
            status: (inserted!.status ?? 'active') as User['status'],
            features: inserted!.features ?? [],
        };
        return ok(created);
    },

    getUser: async function ({ id }) {
        const { data: userData, error: userError } = await supabase
            .from(USER_TABLE_NAME)
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
            displayName: userData.display_name,
            avatarUrl: userData.avatar_url ?? undefined,
            createdAt: userData.created_at,
            status: (userData.status ?? 'active') as User['status'],
            features: userData.features ?? [],
        };
        return ok(mapped);
    },

    updateUser: async function ({ update }) {
        // First, get the current user to check their status
        const { data: currentUser, error: currentUserError } = await supabase
            .from(USER_TABLE_NAME)
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
            .from(USER_TABLE_NAME)
            .update({
                display_name: update.displayName,
                avatar_url: update.avatarUrl,
                // features: update.features, // Should not be allowed to update their own features, right?
                status: update.status,
                setting_overrides: update.settingOverrides as any
            })
            .eq('id', update.id)
            .select('*')
            .single();

        if (updateError || !updatedUser) {
            return err(new NotFoundError(update.id, "User"));
        }

        const mapped: User = {
            id: updatedUser.id,
            displayName: updatedUser.display_name,
            avatarUrl: updatedUser.avatar_url ?? undefined,
            createdAt: updatedUser.created_at,
            status: (updatedUser.status ?? 'active') as User['status'],
            features: updatedUser.features ?? [],
        };
        return ok(mapped);
    },

    // TODO Need to update all access to check for deleted users
    deleteUser: async function ({ userId }) {
        // First, mark for deletion in our public.users table
        const [_, updateErr] = await this.updateUser({ update: { id: userId, status: "deleted" } });
        if (updateErr) {
            return err(updateErr);
        }

        // The official deletion will be managed by admin on the backend

        return ok(undefined);
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
                            return err(new ArgumentError(res.error.message, creds, res.error));
                        default:
                            Err.throw(res.error);
                    }
                } else {
                    const { session, user, weakPassword } = res.data;

                    // Get user data from our public.users table
                    const { data: userData, error: userError } = await supabase
                        .from(USER_TABLE_NAME)
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
                        displayName: userData.display_name,
                        avatarUrl: userData.avatar_url ?? undefined,
                        createdAt: userData.created_at,
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
        return ok(undefined);
    },

    // onAuthStateChanged: (callback: any): UnsubscribeFn => {
    //     const { data } = supabase.auth.onAuthStateChange(callback);
    //     return data.subscription.unsubscribe;
    // },
}

const sessionAbility: IAuthSessionCapable = {
    async getSessionMaterial({ userId }: { userId: string }) {
        try {
            const { data } = await supabase.auth.getSession();
            const sess = data.session;
            if (!sess || sess.user?.id !== userId) return ok(null);
            return ok(sess.refresh_token ?? null);
        } catch {
            return ok(null);
        }
    },
    async restoreSession({ userId, material }: { userId: string, material: string }) {
        // Use refresh token to refresh session; supabase-js will rotate tokens
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: material } as any);
        if (error) {
            return err(new NotImplementedError('Failed to restore session'));
        }
        // TODO:auth/security maybe it's a good idea to update the user from the data.user
        // so any update that happened while the user was away gets propagated into the app
        const newRt = data.session?.refresh_token;
        const rotated = newRt && newRt !== material ? { rotatedMaterial: newRt } : {};
        return ok(rotated);
    }
}
export default { ...api, ...sessionAbility };
