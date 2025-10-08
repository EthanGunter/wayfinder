import type { ArgumentError, Err, InvalidStateError, NotFoundError, NotImplementedError } from "$domain/errors";
import type { LocalUser, LoginCredentials, LoginMethod, RegistrationRequirements, User } from "$domain/models/user";
import type { Result } from "$domain/result";
import type { Readable } from "svelte/store";


export type Fetchable<T> =
	| { status: "loading" }
	| { status: "error", error: Err }
	| { status: "resolved", data: T }

export type AuthState = Exclude<Fetchable<LocalUser>, { status: "resolved" }>
	| { status: "signed-in", user: LocalUser/* , anonymous: boolean */ }
	| { status: "signed-out", user: null }

export type LiveStore<T> = Readable<T>;

export interface IAuthLocal {
	/* --- Observers --- */
	watchAuthState(): LiveStore<AuthState>,


	/* --- Mutators --- */

	/** Registers a remote user account and creates local user simultaneously */
	register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<void, NotImplementedError | ArgumentError>>,

	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(method: LoginMethod): Result<RegistrationRequirements[], NotImplementedError>,

	/** Sets the active user for this device */
	switchUser(newUser: string): Promise<Result<LocalUser, NotFoundError>>,

	/** Updates the active user, unless a specific id is provided */
	updateUser(params: { update: Partial<User> }): Promise<Result<User, NotFoundError>>,
	handleUpdateUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,

	/** Marks a user account as deleted in the server's database
	 * There is currently no method of reactivating deleted accounts
	 */
	deleteUser(params: { userId: string }): Promise<Result<void, NotFoundError>>,
	handleDeleteUserResponse(response: Result<void, { oldUser: LocalUser }>): Promise<void>,

	/** Removes a cached user account from the local machine. It still be logged into remotely */
	removeCachedUser(userId: string): Promise<void>,
	login(params: { creds: LoginCredentials }): Promise<Result<void, NotFoundError | ArgumentError | NotImplementedError>>,
	logout(): Promise<void>,

	// #endregion

}

// NOTE All SyncQueued functions must use the params signature
export interface IAuthRemote {
	/* --- Observers --- */
	watchUser(params: { id: string }): LiveStore<Fetchable<User>>,
	watchUsers(params: { ids: string[] }): LiveStore<Fetchable<User[]>>,


	/* --- Mutators --- */

	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(method: LoginMethod): Result<RegistrationRequirements[], NotImplementedError>,
	/** Responsible for creating a new user account with the given credentials */
	register(params: { creds: LoginCredentials, userData: LocalUser }): Promise<Result<void, NotImplementedError | ArgumentError | InvalidStateError>>,
	updateUser(params: { update: Partial<User> & { id: string } }): Promise<Result<User, NotFoundError>>,
	deleteUser(params: { userId: string }): Promise<Result<void, NotFoundError>>,
	login(params: { creds: LoginCredentials }): Promise<Result<void, NotFoundError | ArgumentError | NotImplementedError>>,
	logout(): Promise<void>,
}

export interface IAuthSessionCapable {
	/** Returns opaque session material for the currently authenticated user (e.g., refresh token) */
	getSessionMaterial(params: { userId: string }): Promise<Result<string | null, NotImplementedError>>;
	/** Restores/refreshes a session for a given user using previously stored material; may return rotated material */
	restoreSession(params: { userId: string, material: string }): Promise<Result<{ rotatedMaterial?: string }, NotImplementedError>>;
}

export function isSessionCapable(auth: IAuthRemote): auth is IAuthRemote & IAuthSessionCapable {
	return typeof (auth as any).getSessionMaterial === 'function' && typeof (auth as any).restoreSession === 'function';
}

export class NetworkError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = "NetworkError";
	}
}