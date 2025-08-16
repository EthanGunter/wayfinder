import type { ILocalTaskProvider, ILocalTasks, ITasks as ITasks, TaskSyncQueue } from "../Tasks";
import type { ArgumentError, InvalidStateError, NotFoundError, NotImplementedError } from "$lib/Errors";
import type { IProvider, Result } from "../types";
import type { SyncQueue } from "../SyncQueue";
import type { User, LocalUser } from "./User";

export type LoginCredentials =
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
    get(remoteAuth: IAuth, localTaskProvider: ILocalTasks): Promise<ILocalAuth>;
}

export type ILocalAuth = IAuthResponseHandler & Omit<IAuth, "register"> & IAuthLocalFunctions & {
    getSyncQueue: () => AuthSyncQueue | null;
}
export type AuthSyncQueue = SyncQueue<Omit<IAuth,
    | "getActiveUser"
    | "getRegistrationRequirements"
    | "getUser">, IAuthResponseHandler>;

// NOTE All SyncQueued functions must use the params signature
export interface IAuth {
    /** Defines the requirements and availability for different Authentication methods */
    getRegistrationRequirements(signUpCred: LoginCredentials): Result<MigrationRequirements[], NotImplementedError>,
    /** Responsible for creating a new user account with the given credentials */
    register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<User, NotImplementedError | ArgumentError>>,
    getUser(params: { id: string }): Promise<Result<User, NotFoundError>>,
    updateUser(params: { update: Partial<User> & { id: string } }): Promise<Result<User, NotFoundError>>,
    deleteUser(params: { userId: string }): Promise<Result<void, NotFoundError>>,
    login(params: { creds: LoginCredentials }): Promise<Result<User, NotFoundError | ArgumentError | NotImplementedError>>,
    logout(): Promise<Result<void>>,
}

export interface IAuthAPI extends IAuth {
    // Additional methods specific to the API implementation
}

// Result<SuccessData, FailureData>
export interface IAuthResponseHandler {
    handleUpdateUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,
    handleDeleteUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,
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
    /** Registers a remote user account and creates local user simultaneously */
    register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<User, NotImplementedError | ArgumentError>>,
}

