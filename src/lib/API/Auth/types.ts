import type { ITaskProvider as ITaskProvider } from "../Tasks";

export interface User {
    id: string;

    // Display
    display_name?: string;
    email?: string;
    avatar_url?: string | null;
}

export type StoredUser = User & {
    is_synced: boolean
    last_active: Date;
    passkey?: string;
    auth_token?: string;
    auth_provider?: 'local' | 'email';
    last_synced?: Date;
    avatar?: Blob;
}

export type SignInCredentials =
    | { type: 'local'; passkey: string }
    | { type: 'email_password'; email: string; password: string }
    | { type: 'passwordless_email'; email: string }
    | { type: 'oauth'; provider: 'google' | 'apple' | 'github'; token?: string }

export type SignUpDetails = SignInCredentials & { username?: string }
export type UnsubscribeFn = () => void;

export type SignOutOptions = {
    signOutSelf: boolean,
    signOutOthers: boolean
}