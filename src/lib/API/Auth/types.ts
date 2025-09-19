import type { ILocalTaskProvider, ILocalTasks, ITasks as ITasks } from "../Tasks";
import { enqueueSyncCommand } from "../SyncQueue";
import type { ArgumentError, InvalidStateError, NotFoundError, NotImplementedError } from "$lib/Errors";
import type { IProvider, Result } from "../types";
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
    get(remoteAuth: IAuth): Promise<ILocalAuth>;
    get(remoteAuth: IAuth, localTaskProvider: ILocalTasks): Promise<ILocalAuth>;
}

export type ILocalAuth = IAuthResponseHandler & Omit<IAuth, "register"> & IAuthLocalFunctions;

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

export interface IAuthSessionCapable {
    /** Returns opaque session material for the currently authenticated user (e.g., refresh token) */
    getSessionMaterial(params: { userId: string }): Promise<Result<string | null, NotImplementedError>>;
    /** Restores/refreshes a session for a given user using previously stored material; may return rotated material */
    restoreSession(params: { userId: string, material: string }): Promise<Result<{ rotatedMaterial?: string }, NotImplementedError>>;
}

export function isSessionCapable(auth: IAuth): auth is IAuth & IAuthSessionCapable {
    return typeof (auth as any).getSessionMaterial === 'function' && typeof (auth as any).restoreSession === 'function';
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

    hasRemote(): boolean;
}

// #region Command surface typing and enqueue helper
type ParamsOf<T> = T extends (arg: infer P) => any ? P : never;
export type AuthRemoteMap = Omit<IAuth, 'getActiveUser' | 'getRegistrationRequirements' | 'getUser'>;
export const AUTH_SYNC_CHANNEL = 'auth';
export async function queueAuthSyncCommand<K extends keyof AuthRemoteMap>(
  fnName: K,
  args: ParamsOf<AuthRemoteMap[K]>,
  revertArgs?: any
): Promise<void> {
  return enqueueSyncCommand(AUTH_SYNC_CHANNEL, String(fnName), args, undefined, revertArgs);
}
// #endregion

