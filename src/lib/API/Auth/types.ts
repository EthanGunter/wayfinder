import type { ITaskProvider as ITaskProvider } from "../Tasks";

export interface User {
    id: string;
    // Auth method
    email?: string;

    // Display
    displayName: string;
    avatarUrl?: string | null;
}

export type LocalUserProxy = User & {
    isSynced: boolean
}
export type SignInCredentials =
    | { type: 'local'; pin: string }
    | { type: 'email_password'; email: string; password: string }
    | { type: 'passwordless_email'; email: string }
    | { type: 'oauth'; provider: 'google' | 'apple' | 'github'; token?: string }

export type SignUpDetails = SignInCredentials & { username?: string }
export type UnsubscribeFn = () => void;

export type SignOutOptions = {
    signOutSelf: boolean,
    signOutOthers: boolean
}

// TODO Convert return types to Result
export interface IAuthProvider {
    getCurrentUser(): Promise<User | null>;
    signIn(credentials: SignInCredentials): Promise<any>;
    signUp(details: SignUpDetails): Promise<any>;
    signOut(opt: SignOutOptions): Promise<any>;
    onAuthStateChanged(callback: any): UnsubscribeFn; // TODO Finalize callback type
}

/* Provides services to handle the account migration from local to remote */
export interface IMigrationProvider {
    /* Gets a list of things needed before the migration can take place */
    getAccountIssues(): /* AccountIssues */string[]
    /* Creates the remote account and uploads all of its data */
    migrateAccount(localAccount: LocalUserProxy, dataAPI: ITaskProvider): Promise<void>
}
