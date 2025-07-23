import type { ITaskAPI as ITaskAPI } from "../Tasks";
import type { InvalidStateError, NotFoundError, NotImplementedError } from "$lib/Errors";
import type { Result } from "../types";

export interface UserData {
    display_name?: string;
    avatar_url?: string | null;
}

export type User = UserData & { id: string; }

export type StoredUser = User & {
    is_synced: boolean;
    last_active: Date;
    auth_provider?: 'local' | 'email';
    last_synced?: Date;
    avatar?: Blob;
}

export type SignInCredentials =
    | { type: 'email_password'; email: string; password: string }

export type SignOutOptions = {
    signOutSelf: boolean,
    signOutOthers: boolean
}

export interface MigrationRequirements {
    target: AccountIssueTarget;
    message: string;
}

export enum AccountIssueTarget {
    email,
    password,
    passwordConfirm
}

export interface IAuthCore {
    signUp: (creds: SignInCredentials, userData: UserData) => Promise<Result<User>>,
    getUser: (id: string) => Promise<Result<User, NotFoundError>>,
    getCurrentUser: () => Promise<Result<User, InvalidStateError>>,
    updateUser: (updates: Partial<User> & { id: string }) => Promise<Result<User>>,
    deleteUser: (userId: string) => Promise<Result<void>>,
    signIn: (creds: SignInCredentials) => Promise<Result<User>>,
    signOut: () => Promise<Result<void>>,
    // onAuthStateChanged: (callback: (user: StoredUser | null) => void) => UnsubscribeFn,
}
export type UnsubscribeFn = () => void;
export interface IAuthCoreReverter {
    undoSignUp: (creds: SignInCredentials, userData: UserData) => Promise<void>,
    undoUpdateUser: (oldUser: StoredUser, newId?: string) => Promise<void>,
    undoDeleteUser: (oldUser: StoredUser) => Promise<void>,
    undoSignIn: (creds: SignInCredentials) => Promise<void>,
    undoSignOut: () => Promise<void>,
}

export interface IMigrationAPI {
    getMigrationRequirements: (signUpCred: SignInCredentials) => Result<MigrationRequirements[], NotImplementedError>,
    migrate: (user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI) => Promise<Result<User, InvalidStateError>>
}
export type ILocalMigrationAPI = Omit<IMigrationAPI, "migrate"> & {
    migrate: (user: StoredUser, signUpCred: SignInCredentials) => Promise<Result<User, InvalidStateError | NotImplementedError>>
}
export interface IMigrationReverter {
    undoMigrate: (user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI) => Promise<Result<User, InvalidStateError>>
}

// TODO Return results
export interface ILocalAuthFunctions {
    createUser: (user: StoredUser) => Promise<Result<StoredUser>>
    getMostRecentUser: () => Promise<StoredUser | null>,
    updateUser: (updates: Partial<StoredUser> & { id: string, oldId?: string }) => Promise<Result<StoredUser>>,
    listUsers: () => Promise<StoredUser[]>,
    switchUser: (userId: string) => Promise<StoredUser>,
    activateNewAnonymousUser: () => Promise<StoredUser>,
    getAnonymousUser: () => Promise<StoredUser | null>,
}

export type IAuthAPI = IAuthCore & IMigrationAPI
export type IAuthAPIReverter = IAuthCoreReverter & IMigrationReverter;
export type ILocalAuthAPI = IAuthCore & ILocalMigrationAPI & ILocalAuthFunctions

