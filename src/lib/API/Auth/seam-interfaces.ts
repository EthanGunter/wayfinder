import type {
	ArgumentError,
	Err,
	InputRequiredError,
	InvalidStateError,
	NotAuthorizedError,
	NotFoundError,
	NotImplementedError,
} from "$domain/errors";
import type { Fetchable } from "$domain/fetchable";
import type {
	SessionUser,
	LoginCredentials,
	RegistrationRequirements,
	User,
} from "$domain/models/user";
import type { Result } from "$domain/result";
import type { Session } from "better-auth";
import type { Readable } from "svelte/store";

export type LiveStore<T> = Readable<T>;

// AuthState is already relatively compact; keep as-is but make it a bit clearer
export type AuthState =
	| Exclude<Fetchable<SessionUser>, { status: "resolved" }>
	| {
		status: "signed-in";
		user: SessionUser; /* , anonymous: boolean */
	}
	| { status: "signed-out" };


interface AuthStateWatcher {
	/** Observes authentication state changes */
	watchAuthState(): LiveStore<AuthState>;
}


interface AuthCommon {
	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(
		creds: LoginCredentials,
	): Result<
		RegistrationRequirements[],
		NotImplementedError
	>;

	/** Sends a reset password email to the given email address */
	sendResetPassword(email: string): Promise<Result<{ userMessage: string }, ArgumentError>>;
	resetPassword(token: string, newPassword: string): Promise<Result<void, NotAuthorizedError>>;

	login(creds: LoginCredentials): Promise<Result<
		void,
		NotFoundError | ArgumentError | NotImplementedError
	>>;

	deleteUser(params: {
		userId: string;
	}): Promise<Result<void, NotFoundError>>;
}

export interface IAuthLocal extends AuthStateWatcher, AuthCommon {
	/* --- Observers --- */
	// watchAuthState inherited

	/* --- Mutators --- */

	/** Registers a remote user account and creates local user simultaneously */
	register(params: {
		creds: LoginCredentials;
		userData: User;
	}): Promise<Result<void, NotImplementedError | ArgumentError>>;

	/** Sets the active user for this device */
	switchUser(
		newUser: string,
	): Promise<Result<SessionUser, NotFoundError | InputRequiredError>>;

	/** Updates the active user, unless a specific id is provided */
	updateUser(params: {
		update: Partial<User>;
	}): Promise<Result<User, NotFoundError>>;

	handleUpdateUserResponse(
		response: Result<void, { oldUser: SessionUser }>,
	): Promise<void>;

	handleDeleteUserResponse(
		response: Result<void, { oldUser: SessionUser }>,
	): Promise<void>;

	/** Removes a cached user account from the local machine. It still be logged into remotely */
	removeCachedUser(userId: string): Promise<void>;

	logout(options?: { keepCached?: boolean }): Promise<void>;
}

export interface IAuthRemote extends AuthStateWatcher, AuthCommon {
	/* --- Observers --- */
	// watchAuthState inherited

	watchUsers(params: {
		ids: string[];
	}): LiveStore<Fetchable<User[] /* TODO public UserDTO */>>;

	/* --- Mutators --- */

	/** Responsible for creating a new user account with the given credentials */
	register(
		params: {
			creds: LoginCredentials;
			userData: SessionUser;
		},
	): Promise<
		Result<void, NotImplementedError | ArgumentError | InvalidStateError>
	>;

	updateUser(params: {
		update: Partial<User> & { id: string };
	}): Promise<Result<User, NotFoundError>>;

	logout(options?: { keepCached?: boolean }): Promise<void>;
}

export interface IAuthSessionCapable {
	/** Returns opaque session material for the currently authenticated user (e.g., refresh token)
	 * @error InvalidStateError if the user is not authenticated
	 */
	getSessionMaterial(params: {
		userId: string;
	}): Promise<Result<string | null, InvalidStateError>>;

	/** Restores/refreshes a session for a given user using previously stored material; may return rotated material
	 * @error InputRequiredError if the session is expired
	 */
	restoreSession(params: {
		userId: string;
		material: string;
	}): Promise<
		Result<{ rotatedMaterial?: string }, InputRequiredError>
	>;

	/** Lists device sessions and associated users that can be switched to */
	getUserSessions(): Promise<
		Result<
			{
				session: {
					token: string;
					userId: string;
					expiresAt: Date;
				};
				user: {
					id: string;
					displayName: string;
					avatarUrl?: string;
				};
			}[],
			InvalidStateError
		>
	>;
}


//#region UTILITY FUNCTIONS

export function isSessionCapable(
	auth: IAuthRemote,
): auth is IAuthRemote & IAuthSessionCapable {
	return (
		typeof (auth as any).getSessionMaterial === "function" &&
		typeof (auth as any).restoreSession === "function"
	);
}

export class NetworkError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = "NetworkError";
		// optional: if you actually want to use cause later, keep it
		// (ES2022 ErrorOptions['cause'] pattern)
		if (cause) {
			(this as any).cause = cause;
		}
	}
}

//#endregion