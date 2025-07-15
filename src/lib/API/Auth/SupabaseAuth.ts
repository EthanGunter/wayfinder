import supabase from '$lib/API/SupabaseClient'
import type { IAuthProvider, SignInCredentials, SignOutOptions, SignUpDetails, UnsubscribeFn, User } from './types';

export default class SupabaseAuth implements IAuthProvider {
    constructor() {
        const { data } = supabase.auth.onAuthStateChange((evt, sesh) => {
            switch (evt) {
                case 'INITIAL_SESSION': break;
                case 'PASSWORD_RECOVERY': break;
                case 'SIGNED_IN': break;
                case 'SIGNED_OUT': break;
                case 'TOKEN_REFRESHED': break;
                case 'USER_UPDATED': break;
                case 'MFA_CHALLENGE_VERIFIED': break;
                default:
                    console.log("Auth state change", evt, sesh);
            }
        })
    }

    async getCurrentUser(): Promise<User | null> {
        const userRes = await supabase.auth.getUser();
        if (userRes.error) {
            console.error(userRes.error); // TODO DEV ONLY
            return null;
        } else {
            const user = userRes.data.user;
            return {
                id: user.id,
                email: user.email,
                displayName: user.user_metadata.displayName,
                avatarUrl: user.user_metadata.avatarUrl,
            };
        }
    }
    async signIn(cred: SignInCredentials): Promise<any> {
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
            default: throw new Error(`Sign-in method not implemented: ${cred.type}`)
        }
    }
    async signUp(details: SignUpDetails): Promise<any> {
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
            default: throw new Error(`Sign-up method not implemented: ${details.type}`)
        }
    }
    async signOut(options: SignOutOptions): Promise<void> {
        let scope: 'global' | 'local' | 'others' = options.signOutSelf ? (options.signOutOthers ? 'global' : 'local') : 'others';
        const error = await supabase.auth.signOut({ scope });
        if (error.error) {
            console.error("Error signing out:", error.error);
        }
    }
    onAuthStateChanged(callback: any): UnsubscribeFn {
        const { data } = supabase.auth.onAuthStateChange(callback);
        return data.subscription.unsubscribe;
    }

}