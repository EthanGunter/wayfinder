import { Err } from "$domain/errors";


//#region User Interface and Utilities

export type UserStatus = "active" | "deleted";
export type UserFeature =
	| 'dev'
	| 'no-task-limit'
	| 'import-export'

// Base user interface
export interface User<TimeFormat = Date> {
	id: string;
	displayName: string;
	avatarUrl?: string;
	createdAt: TimeFormat;
	status: UserStatus;
	features: UserFeature[];
	settingOverrides?: any/* AppSettings */;
}

// Local user interface extends base user with local avatar, settings, and session material
export type SessionUser = User &
	({
		sessionStatus: 'active' | 'expired';
		expiresAt: Date;
		sessionRefreshMaterial?: string; // Refresh token or other session restoration data
	} | {
		sessionStatus: 'expired';
		sessionRefreshMaterial?: string; // Refresh token or other session restoration data
	} | {
		sessionStatus: 'revoked'
	})

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


export type LoginCredentials =
	| { type: 'email_password'; email: string; password: string }
	| { type: 'external'; }

export class IncorrectPasswordError extends Err {
	constructor(message: string, ctx?: any) {
		super("IncorrectPasswordError", message, ctx);
	}
}

export type SignOutOptions = {
	signOutSelf: boolean,
	signOutOthers: boolean
}

export interface RegistrationRequirements {
	target: AccountIssueTarget;
	message: string;
}

export enum AccountIssueTarget {
	email,
	password,
	passwordConfirm
}


//#region Convex Error Types

// This is a weird way of type-limiting throw types for clients. 
// Convex doesn't codegen thrown error types
export type UserServerErr = {
	type: any, msg: string, ctx?: any
}

export type UpdateErr = UserServerErr & { type: "NotFoundError" | "NotAuthorizedError" };
export type DeleteErr = UserServerErr & { type: "NotFoundError" };
export type EnsureUserErr = UserServerErr & { type: "NotAuthorizedError" | "InvalidStateError" };
export type WatchUserErr = UserServerErr & { type: "InvalidStateError" };

//#endregion