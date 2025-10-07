//#region User Interface and Utilities

import type { AppSettings } from "$lib/user-settings";
import { Err, type ArgumentError, type InvalidStateError, type NotFoundError, type NotImplementedError } from "$domain/errors";
import type { Result } from "$domain/result";

export type UserStatus = "active" | "deleted";
export type UserFeature =
	| 'dev'
	| 'task-sync'

// Base user interface
export interface User {
	id: string;
	display_name: string;
	avatar_url?: string;
	created_at: string;
	status: UserStatus;
	features: string[];
	setting_overrides?: AppSettings;
}

// Local user interface extends base user with local avatar and settings
export interface LocalUser extends User {
	avatar?: Blob;
}

// Utility functions for User objects
/**
 * Check if the user has a specific feature
 */
export function userHasFeature(user: User, feature: UserFeature): boolean {
	return user.features.includes(feature);
}

/**
 * Check if the user is anonymous (has a special anonymous ID)
 */
export function isAnonymous(user: User): boolean {
	return user.id === 'anonymous';
}

/**
 * Get default features for anonymous users
 */
export function getDefaultUserFeatures(): UserFeature[] {
	return [];
}

//#endregion


//#region API Interfaces


export type LoginCredentials =
	| { type: 'email_password'; email: string; password: string }

export class IncorrectPasswordError extends Err {
	constructor(message: string, ctx?: any) {
		super("IncorrectPasswordError", message, ctx);
	}
}

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


//#region Local Auth

export type AuthState =
	| { status: "loading" }
	| { status: "signed-in", user: LocalUser }
	| { status: "signed-out", user: null }
	| { status: "error", error: Err }


export interface IAuthLocal {
	/* TODO:temp Anonymous accounts disableds
	/** Creates a local user account */
	// createUser(params: { user: LocalUser }): Promise<Result<LocalUser>>
	/** 
	 * Gets either the active user, or a default anonymous account
	 * @error No user is signed in
	 * @note anonymous accounts currently disabled
	 */
	getUser(): Promise<Result<LocalUser, InvalidStateError>>,

	/** Registers a remote user account and creates local user simultaneously */
	register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<User, NotImplementedError | ArgumentError>>,

	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(signUpCred: LoginCredentials): Result<MigrationRequirements[], NotImplementedError>,

	/** Sets the active user for this device */
	switchUser(newUser: string): Promise<Result<LocalUser, NotFoundError>>,
	/**
	 * Updates the active user, unless a specific id is provided
	 */
	updateUser(params: { update: Partial<User> }): Promise<Result<User, NotFoundError>>,
	handleUpdateUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,

	/** Marks a user account as deleted in the server's database
	 * There is currently no method of reactivating deleted accounts
	 */
	deleteUser(params: { userId: string }): Promise<Result<void, NotFoundError>>,
	handleDeleteUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,

	/** Removes a cached user account from the local machine. It still be logged into remotely */
	removeCachedUser(userId: string): Promise<void>,
	login(params: { creds: LoginCredentials }): Promise<Result<User, NotFoundError | ArgumentError | NotImplementedError>>,
	logout(): Promise<Result<void>>,

}

//#endregion


//#region Remote Auth

// NOTE All SyncQueued functions must use the params signature
export interface IAuth {
	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(signUpCred: LoginCredentials): Result<MigrationRequirements[], NotImplementedError>,
	/** Responsible for creating a new user account with the given credentials */
	register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<User, NotImplementedError | ArgumentError | InvalidStateError>>,
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

//#endregion

/* TODO:temp SyncQueue disabled
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
*/

//#endregion