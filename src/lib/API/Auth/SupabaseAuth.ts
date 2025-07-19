import supabase from '$lib/API/SupabaseClient'
import { err, ok, type Result } from 'neverthrow';
import type { SignInCredentials, SignOutOptions, SignUpDetails, StoredUser, UnsubscribeFn, User } from './types';
import type { IProvider } from '../Tasks';
import type { UserAttributes } from '@supabase/supabase-js';
import { NotFoundError, Err } from '$lib/Errors';

interface AuthProvider {
    getCurrentUser: () => Promise<User | null>
    signUp: (details: SignUpDetails) => Promise<User>,
    signIn: (cred: SignInCredentials) => Promise<User>,
    signOut: (options?: SignOutOptions) => Promise<Result<void, Err>>,
    updateUser: (update: Partial<StoredUser> & { id: string }) => Promise<Result<User, Err>>,
    deleteUser: (userId: string) => Promise<void>,
    onAuthStateChanged: (callback: (user: User | null) => void) => UnsubscribeFn,
    getMigrationNeeds: (user: StoredUser) => MigrationRequirements[],
    migrateUser: (user: StoredUser) => Promise<Result<User, MigrationRequirements[]>>
}

export const supabaseAuth: AuthProvider = {
    getCurrentUser: async (): Promise<User | null> => {
        const userRes = await supabase.auth.getUser();
        if (userRes.error) {
            console.error(userRes.error); // TODO DEV ONLY
            return null;
        } else {
            const user = userRes.data.user;
            return {
                id: user.id,
                display_name: user.user_metadata.displayName,
                avatar_url: user.user_metadata.avatarUrl,
            };
        }
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
            default: throw new Error(`Sign-in method not implemented: ${cred.type}`);
        }
    },

    signUp: async (details: SignUpDetails): Promise<any> => {
        switch (details.type) {
            case 'email_password': {
                const res = await supabase.auth.signUp({
                    email: details.email,
                    password: details.password,
                });
                if (res.error) {
                    console.error(res.error);
                } else return res.data;
            }
            default: throw new Error(`Sign-up method not supported by Supabase: ${details.type}`);
        }
    },

    signOut: async (options?: SignOutOptions): Promise<Result<void, Err>> => {
        let scope: 'global' | 'local' | 'others' = options?.signOutSelf ? (options.signOutOthers ? 'global' : 'local') : 'others';
        const error = await supabase.auth.signOut({ scope });
        if (error.error) {
            Err.Wrap(error.error);
        }
        return ok();
    },

    onAuthStateChanged: (callback: any): UnsubscribeFn => {
        const { data } = supabase.auth.onAuthStateChange(callback);
        return data.subscription.unsubscribe;
    },

    getMigrationNeeds: (user: StoredUser): MigrationRequirements[] => {
        const issues: MigrationRequirements[] = [];


        if (!user.email || user.email == '') {
            issues.push({ target: AccountIssueTarget.email, message: "Email required" });
        } else if (!user.email.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+[.][A-Za-z.]{2,}$/)) {
            issues.push({ target: AccountIssueTarget.email, message: "Email format invalid" });
        }


        if (!user.passkey) {
            issues.push({ target: AccountIssueTarget.password, message: "Password required" });
        } else if (user.passkey.length < 8) {
            issues.push({ target: AccountIssueTarget.password, message: "Password must be at least 8 characters" });
        }

        return issues;
    },

    // TODO Convert to function* and yield progress results
    migrateUser: async (user: StoredUser): Promise<Result<User, MigrationRequirements[]>> => {
        const migNeeds = supabaseAuth.getMigrationNeeds(user);
        if (migNeeds.length > 0) return err(migNeeds);

        // TODO Manage Supabase account migration
        console.log("Mocking Supabase migration");
        // await sup
        return ok({} as StoredUser);
    },

    updateUser: async function (update: Partial<StoredUser> & { id: string; }): Promise<Result<User, Err>> {
        const updatedUser: UserAttributes = {
            email: update.email,
            password: update.passkey,
            data: {
                last_synced: update.last_synced,
                last_active: new Date(),
                display_name: update.display_name,
                avatar_url: update.avatar_url,
            }
        };

        const userResponse = await supabase.auth.updateUser(updatedUser,)
        if (userResponse.error) {
            console.error(userResponse.error);
            return err(Err.Wrap(userResponse.error));
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

    deleteUser: async function (userId: string): Promise<void> {
        // TODO deleting users requires admin access...
        // Common suggestion is to have a public.users/profiles table with a foreign-key constraint to auth.users...
        return;
    }
}


interface MigrationRequirements {
    target: AccountIssueTarget;
    message: string;
}
export enum AccountIssueTarget {
    email,
    password,
    passwordConfirm
}



const provider: IProvider<AuthProvider> = {
    get: async () => supabaseAuth,
    close: async () => { },
}
export default provider;