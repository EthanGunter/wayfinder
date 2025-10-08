import { Err, type ArgumentError, type InvalidStateError, type NotFoundError, type NotImplementedError } from "$domain/errors";
import type { Result } from "$domain/result";
// import type { AppSettings } from "$lib/user-settings/schema";


//#region User Interface and Utilities

export type UserStatus = "active" | "deleted";
export type UserFeature =
	| 'dev'
	| 'task-sync'

// Base user interface
export interface User {
	id: string;
	displayName: string;
	avatarUrl?: string;
	createdAt: Date;
	status: UserStatus;
	features: string[];
	settingOverrides?: any/* AppSettings */;
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

export interface RegistrationRequirements {
	target: AccountIssueTarget;
	message: string;
}

export enum AccountIssueTarget {
	email,
	password,
	passwordConfirm
}
