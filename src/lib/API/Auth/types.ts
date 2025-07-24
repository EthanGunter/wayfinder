import type { ITaskAPI as ITaskAPI } from "../Tasks";
import type { InvalidStateError, NotFoundError, NotImplementedError } from "$lib/Errors";
import type { Result } from "../types";

export interface UserData {
    display_name?: string;
    avatar_url?: string | null;
    last_synced?: Date;
}

export type User = UserData & { id: string; }

export type StoredUser = User & {
    is_synced: boolean;
    last_active: Date;
    auth_provider?: 'local' | 'email';
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

export interface ILocalAuthProvider {
    get(remoteAuth?: IAuthAPI, remoteTasks?: ITaskAPI): Promise<ILocalAuthAPI & ILocalAuth>;
    close(): Promise<void>
}

export type IAuthAPI = IAuthCore & IMigrator
export type IAuthAPIResponseHandler = IAuthCoreResponseHandler & IMigrationResponseHandler;
export type ILocalAuthAPI = IAuthCore & ILocalMigrator & ILocalAuth

// NOTE All SyncQueued functions must use the params signature
export interface IAuthCore {
    signUp(params: { creds: SignInCredentials, userData: UserData }): Promise<Result<User>>,
    getUser(params: { id: string }): Promise<Result<User, NotFoundError>>,
    getCurrentUser(): Promise<Result<User, InvalidStateError>>,
    updateUser(params: { update: Partial<User> & { id: string } }): Promise<Result<User>>,
    deleteUser(params: { userId: string }): Promise<Result<void>>,
    signIn(params: { creds: SignInCredentials }): Promise<Result<User>>,
    signOut(): Promise<Result<void>>,
}
export interface IAuthCoreResponseHandler {
    handleSignUpResponse(response: Result<void, { creds: SignInCredentials, userData: UserData }>): Promise<void>,
    handleUpdateUserResponse(response: Result<void, { oldUser: StoredUser, newId?: string }>): Promise<void>,
    handleDeleteUserResponse(response: Result<void, { oldUser: StoredUser }>): Promise<void>,
    handleSignInResponse(response: Result<void, { creds: SignInCredentials }>): Promise<void>,
    handleSignOutResponse(response: Result<void>): Promise<void>,
}

export interface IMigrator {
    getMigrationRequirements(signUpCred: SignInCredentials): Result<MigrationRequirements[], NotImplementedError>,
    // TODO taskProvider: ITaskAPI will NOT serialize, and jeopardizes the SyncQueue...
    migrate(params: { user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI }): Promise<Result<User, InvalidStateError>>
}
export interface IMigrationResponseHandler {
    // TODO taskProvider: ITaskAPI will NOT serialize, and jeopardizes the SyncQueue...
    handleMigrateResponse(response: Result<{ user: StoredUser, signUpCred: SignInCredentials, taskProvider: ITaskAPI }>): Promise<Result<User, InvalidStateError>>
}
export type ILocalMigrator = Omit<IMigrator, "migrate"> & {
    migrate(params: { user: StoredUser, signUpCred: SignInCredentials }): Promise<Result<User, InvalidStateError | NotImplementedError>>
}

export interface ILocalAuth {
    createUser(params: { user: StoredUser }): Promise<Result<StoredUser>>
    getMostRecentUser(): Promise<StoredUser | null>,
    updateUser(params: { update: Partial<StoredUser> & { id: string, oldId?: string } }): Promise<Result<StoredUser>>,
    listUsers(): Promise<StoredUser[]>,
    switchUser(params: { userId: string }): Promise<StoredUser>,
    activateNewAnonymousUser(): Promise<StoredUser>,
    getAnonymousUser(): Promise<StoredUser | null>,
}
