import type { Result } from "neverthrow";
import type { ITaskAPI as ITaskAPI } from "../Tasks";
import type { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError, UnknownError } from "$lib/Errors";

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
    signUp: (creds: SignInCredentials, userData: UserData) => Promise<Result<User, UnknownError>>,
    getUser: (id: string) => Promise<Result<User, NotFoundError>>,
    getCurrentUser: () => Promise<Result<User, InvalidStateError | UnknownError>>,
    updateUser: (updates: Partial<User> & { id: string }) => Promise<Result<User, UnknownError>>,
    deleteUser: (userId: string) => Promise<Result<void, UnknownError>>,
    signIn: (creds: SignInCredentials) => Promise<Result<User, UnknownError>>,
    signOut: () => Promise<Result<void, UnknownError>>,
    // onAuthStateChanged: (callback: (user: StoredUser | null) => void) => UnsubscribeFn,
}
export type UnsubscribeFn = () => void;
export interface IAuthCoreReverter {
    undoSignUp: (creds: SignInCredentials, userData: UserData) => Promise<Result<User, UnknownError>>,
    undoUpdateUser: (updates: Partial<User> & { id: string }) => Promise<Result<User, UnknownError>>,
    undoDeleteUser: (userId: string) => Promise<Result<void, UnknownError>>,
    undoSignIn: (creds: SignInCredentials) => Promise<Result<User, UnknownError>>,
    undoSignOut: () => Promise<Result<void, UnknownError>>,
}

export interface IMigrationAPI {
    getMigrationRequirements: (signUpCred: SignInCredentials) => Result<MigrationRequirements[], NotImplementedError | UnknownError>,
    migrate: (user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI) => Promise<Result<User, InvalidStateError>>
}
export type ILocalMigrationAPI = Omit<IMigrationAPI, "migrate"> & {
    migrate: (user: StoredUser, signUpCred: SignInCredentials) => Promise<Result<User, InvalidStateError | NotImplementedError | UnknownError>>
}
export interface IMigrationReverter {
    undoMigrate: (user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI) => Promise<Result<User, InvalidStateError>>
}

// TODO Return results
export interface ILocalAuthFunctions {
    createUser: (user: StoredUser) => Promise<Result<StoredUser, UnknownError>>
    getMostRecentUser: () => Promise<StoredUser | null>,
    updateUser: (updates: Partial<StoredUser> & { id: string, oldId?: string }) => Promise<Result<StoredUser, UnknownError>>,
    listUsers: () => Promise<StoredUser[]>,
    switchUser: (userId: string) => Promise<StoredUser>,
    activateNewAnonymousUser: () => Promise<StoredUser>,
    getAnonymousUser: () => Promise<StoredUser | null>,
}

export type IAuthAPI = IAuthCore & IMigrationAPI
export type IAuthAPIReverter = IAuthCoreReverter & IMigrationReverter;
export type ILocalAuthAPI = IAuthCore & ILocalMigrationAPI & ILocalAuthFunctions

