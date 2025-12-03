import { ArgumentError, InvalidStateError, NotAuthorizedError } from '$domain/errors';
import { get, readable } from 'svelte/store';
import { remoteAuth } from '.';
import { err, ok } from '$domain/result';
import { isAnonymous } from '$domain/models/user';
import type { AuthState, IAuthLocal, LiveStore } from './seam-interfaces';

// Lazy init to avoid circular dependency with index.ts
export const passthroughAuthState: LiveStore<AuthState> = readable(
	{ status: "loading" } as AuthState,
	(set) => {
		// Defer access to remoteAuth until first subscription (after module initialization)
		const unsubscribe = remoteAuth.watchAuthState().subscribe((state) => set(state));
		return unsubscribe;
	}
);

const api: IAuthLocal = {
	watchAuthState: () => {
		return passthroughAuthState;
	},

	register: async ({ creds, userData }) => {
		if (isAnonymous(userData)) {
			return err(new InvalidStateError("Cannot register an account with 'anonymous' id", userData))
		}

		const [reqmts, reqErr] = api.getRegistrationRequirements(creds);
		if (reqErr) {
			return err(reqErr);
		} else if (reqmts.length > 0) {
			return err(new ArgumentError(`Registration credentials had errors. Make sure to call getRegistrationRequirements() before register()`, creds));
		}

		// Create the new account on the server (triggers redirect to WorkOS)
		const [, regErr] = await remoteAuth.register({ creds, userData });
		if (regErr) {
			if (regErr instanceof ArgumentError) {
				// Attempt to log the user in with the account
				return await api.login(creds);
			}
			return err(regErr);
		}

		// Note: User will be automatically cached by the auth state subscription
		// after the WorkOS callback completes and auth state changes to signed-in
		return ok(undefined);
	},
	sendResetPassword: async (email) => remoteAuth.sendResetPassword(email),
	resetPassword: async (token, newPassword) => remoteAuth.resetPassword(token, newPassword),
	getRegistrationRequirements: (signUpCred) => {
		return remoteAuth.getRegistrationRequirements(signUpCred);
	},

	updateUser: async ({ update }) => {
		let userId: string;
		if (update.id) {
			userId = update.id;
		} else {
			const activeId = getActiveUserId();
			if (!activeId) {
				return err(new InvalidStateError("No active user to update"));
			}
			userId = activeId;
		}

		// Call remote to update - no local caching needed
		// watchUsers subscription will pick up the changes automatically
		const updateWithId = { ...update, id: userId };
		const [remoteUser, remoteErr] = await remoteAuth.updateUser({ update: updateWithId });
		if (remoteErr) {
			return err(remoteErr);
		}

		return ok(remoteUser);
	},

	handleUpdateUserResponse: async () => {
		// No-op: we don't do optimistic updates, so no rollback needed
	},

	deleteSelf: async () => {
		const userId = getActiveUserId();
		if (!userId) {
			return err(new NotAuthorizedError("No active user to delete"));
		}

		// Delete remote first
		const [, remoteErr] = await remoteAuth.deleteSelf();
		if (remoteErr) {
			return err(remoteErr);
		}

		return ok(undefined);
	},

	handleDeleteUserResponse: async () => {
		// No-op: we don't do optimistic updates, so no rollback needed
	},

	login: async (creds) => {
		// Remote login (triggers redirect to WorkOS)
		const [, loginErr] = await remoteAuth.login(creds);
		if (loginErr) {
			return err(loginErr);
		}

		// Note: User will be automatically cached by the auth state subscription
		// after the WorkOS callback completes and auth state changes to signed-in
		return ok();
	},

	logout: async () => {
		// Invalidate remote session (clears cookie + WorkOS session)
		await remoteAuth.logout();
	}
}

export default api;

// #region UTILITIES

// Helper to get active user ID from remote auth state
function getActiveUserId(): string | undefined {
	const state = get(remoteAuth.watchAuthState());
	return state.status === 'signed-in' ? state.user.id : undefined;
}

// #endregion
