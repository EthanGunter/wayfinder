import type { ILocalTaskProvider, ITaskAPI as ITaskAPI, TaskSyncQueue } from "../Tasks";
import type { ArgumentError, InvalidStateError, NotFoundError, NotImplementedError } from "$lib/Errors";
import type { IProvider, Result } from "../types";
import type { SyncQueue } from "../SyncQueue";

export interface UserData {
    display_name?: string;
    avatar_url?: string | null;
    last_synced?: Date;
}

export type User = UserData & { id: string; }

export type LocalUser = User & {
    last_active: Date;
    auth_provider?: 'local' | 'email';
    avatar?: Blob;
    /** True if the user needs to be manually logged in again */
    // needsCredentials: boolean; // TODO implement for local security
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
    get(): Promise<ILocalAuth>;
    get(remoteAuthProvider: IProvider<IAuth>, localTaskProvider: ILocalTaskProvider): Promise<ILocalAuth>;
    getSyncQueue(): AuthSyncQueue | null;
}

export type IAuthLocal = Omit<IAuth, "register"> & IAuthResponseHandler & {
    /** Registers a remote user account, then migrates the local user's data to the remote provider */
    register(params: { creds: SignInCredentials, userData: LocalUser }): Promise<Result<User, NotImplementedError | ArgumentError>>,
};
export type ILocalAuth = IAuthLocal & IAuthLocalFunctions;
export type AuthSyncQueue = SyncQueue<Omit<IAuth,
    | "getActiveUser"
    | "getRegistrationRequirements"
    | "getUser">, IAuthResponseHandler>;

// NOTE All SyncQueued functions must use the params signature
export interface IAuth {
    /** Defines the requirements and availability for different Authentication methods */
    getRegistrationRequirements(signUpCred: SignInCredentials): Result<MigrationRequirements[], NotImplementedError>,
    /** Responsible for creating a new user account with the given credentials */
    register(params: { creds: SignInCredentials, userData: UserData }): Promise<Result<User, NotImplementedError | ArgumentError>>,
    getUser(params: { id: string }): Promise<Result<User, NotFoundError>>,
    updateUser(params: { update: Partial<User> & { id: string } }): Promise<Result<User>>,
    deleteUser(params: { userId: string }): Promise<Result<void>>,
    login(params: { creds: SignInCredentials }): Promise<Result<User>>,
    logout(): Promise<Result<void>>,
}

// Result<SuccessData, FailureData>
export interface IAuthResponseHandler {
    // handleRegisterResponse(response: Result<{ oldUser: StoredUser, registeredUser: User }, { creds: SignInCredentials, lastLoggedIn: string | undefined, oldUser: StoredUser }>): Promise<void>,
    handleUpdateUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,
    handleDeleteUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,
    handleLoginResponse(response: Result<void, { creds: SignInCredentials }>): Promise<void>,
}

export interface IAuthLocalFunctions {
    /** Creates a local user account */
    createUser(params: { user: LocalUser }): Promise<Result<LocalUser>>

    /** 
     * Gets the last logged in user
     * @returns null if all users signed out
     */
    getActiveUser(): Promise<LocalUser | null>,
    /** 
     * Gets either an anonymous account, or the solo-user account
     * @error InvalidStateError when there is more than one user
     */
    getDefaultUser(): Promise<Result<LocalUser, InvalidStateError>>,
    /** Returns all locally cached users */
    listUsers(): Promise<LocalUser[]>,
    /** Removes a cached user account from the local machine. It still be logged into remotely */
    removeUser(userId: string): Promise<void>
    /** Sets the active user for this device */
    switchUser(newUser: string): Promise<Result<LocalUser, NotFoundError>>,
}
