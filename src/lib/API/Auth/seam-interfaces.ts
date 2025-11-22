import type {
	ArgumentError,
	Err,
	InputRequiredError,
	InvalidStateError,
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
import type { Readable } from "svelte/store";

/* -------------------------------------------------------------------------- */
/*  Shared aliases                                                            */
/* -------------------------------------------------------------------------- */

export type LiveStore<T> = Readable<T>;

// AuthState is already relatively compact; keep as-is but make it a bit clearer
export type AuthState =
	| Exclude<Fetchable<SessionUser>, { status: "resolved" }>
	| {
		status: "signed-in";
		user: SessionUser; /* , anonymous: boolean */
	}
	| { status: "signed-out" };

/* -------------------------------------------------------------------------- */
/*  Small capability-style fragments to dedupe signatures                     */
/* -------------------------------------------------------------------------- */

type RegistrationResult = Result<
	RegistrationRequirements[],
	NotImplementedError
>;

type ResetPasswordResult = Result<{ userMessage: string }, ArgumentError>;

type LoginResult = Result<
	void,
	NotFoundError | ArgumentError | NotImplementedError
>;

/** shared shape for registration params */
type RegistrationParams<TUser> = {
	creds: LoginCredentials;
	userData: TUser;
};

/* -------------------------------------------------------------------------- */
/*  Common observer capabilities                                              */
/* -------------------------------------------------------------------------- */

interface AuthStateWatcher {
	/** Observes authentication state changes */
	watchAuthState(): LiveStore<AuthState>;
}

/* -------------------------------------------------------------------------- */
/*  Interface: IAuthLocal                                                     */
/* -------------------------------------------------------------------------- */

export interface IAuthLocal extends AuthStateWatcher {
	/* --- Observers --- */
	// watchAuthState inherited

	/* --- Mutators --- */

	/** Registers a remote user account and creates local user simultaneously */
	register(params: {
		creds: LoginCredentials;
		userData: User;
	}): Promise<Result<void, NotImplementedError | ArgumentError>>;

	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(
		method: LoginCredentials,
	): RegistrationResult;

	/** Sends a reset password email to the given email address */
	sendResetPassword(email: string): Promise<ResetPasswordResult>;

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

	/** Marks a user account as deleted in the server's database
	 * There is currently no method of reactivating deleted accounts
	 */
	deleteUser(params: {
		userId: string;
	}): Promise<Result<void, NotFoundError>>;

	handleDeleteUserResponse(
		response: Result<void, { oldUser: SessionUser }>,
	): Promise<void>;

	/** Removes a cached user account from the local machine. It still be logged into remotely */
	removeCachedUser(userId: string): Promise<void>;

	login(creds: LoginCredentials): Promise<LoginResult>;

	logout(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Interface: IAuthRemote                                                    */
/* -------------------------------------------------------------------------- */

export interface IAuthRemote extends AuthStateWatcher {
	/* --- Observers --- */
	// watchAuthState inherited

	watchUsers(params: {
		ids: string[];
	}): LiveStore<Fetchable<User[] /* TODO public UserDTO */>>;

	/* --- Mutators --- */

	/** Defines the requirements and availability for different Authentication methods */
	getRegistrationRequirements(
		creds: LoginCredentials,
	): RegistrationResult;

	/** Sends a reset password email to the given email address */
	sendResetPassword(email: string): Promise<ResetPasswordResult>;

	/** Responsible for creating a new user account with the given credentials */
	register(
		params: RegistrationParams<SessionUser>,
	): Promise<
		Result<void, NotImplementedError | ArgumentError | InvalidStateError>
	>;

	updateUser(params: {
		update: Partial<User> & { id: string };
	}): Promise<Result<User, NotFoundError>>;

	deleteUser(params: {
		userId: string;
	}): Promise<Result<void, NotFoundError>>;

	login(creds: LoginCredentials): Promise<LoginResult>;

	logout(options?: { keepCached?: boolean }): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Interface: IAuthSessionCapable                                            */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Type guard & Error class                                                  */
/* -------------------------------------------------------------------------- */

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