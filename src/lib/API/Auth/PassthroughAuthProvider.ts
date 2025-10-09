import { NotFoundError, Err, InvalidStateError } from "$domain/errors";
import { err } from "$domain/result";
import type { IAuthLocal, IAuthRemote } from "./seam-interfaces";
import { get } from "svelte/store";

/** Skips the optimistic update paths for local provider and calls the remote provider where possible */
export function getApi(localAuth: IAuthLocal, remoteAuth: IAuthRemote): IAuthLocal {
	if (!localAuth) Err.throw(new InvalidStateError("Cannot use PassthroughAuthProvider without local auth provider"));
	if (!remoteAuth) Err.throw(new InvalidStateError("Cannot use PassthroughAuthProvider without remote auth provider"));

	return ({
		// Local-only: no remote equivalent
		watchAuthState: () => remoteAuth.watchAuthState(),

		// Remote preferred: exists on IAuthRemote
		register: (params) => remoteAuth.register(params),

		// Remote preferred: exists on IAuthRemote
		getRegistrationRequirements: (method) => remoteAuth.getRegistrationRequirements(method),

		// Local-only: no remote equivalent
		switchUser: (newUser) => localAuth.switchUser(newUser),

		// Remote preferred: exists on IAuthRemote
		updateUser: async (params) => {
			const { update } = params;
			// Remote requires id, so we need to get it from local if not provided
			if (update.id) {
				return remoteAuth.updateUser({ update: { ...update, id: update.id } });
			}

			const authState = get(localAuth.watchAuthState());
			if (authState.status !== 'signed-in') {
				return err(new NotFoundError('No active user', 'User'));
			}

			const currentUser = authState.user;
			return remoteAuth.updateUser({ update: { ...update, id: currentUser.id } });
		},

		// Local-only: handler for optimistic updates
		handleUpdateUserResponse: (response) => localAuth.handleUpdateUserResponse(response),

		// Remote preferred: exists on IAuthRemote
		deleteUser: (params) => remoteAuth.deleteUser(params),

		// Local-only: handler for optimistic updates
		handleDeleteUserResponse: (response) => localAuth.handleDeleteUserResponse(response),

		// Local-only: manages local cache
		removeCachedUser: (userId) => localAuth.removeCachedUser(userId),

		// Remote preferred: exists on IAuthRemote
		login: (params) => remoteAuth.login(params),

		// Remote preferred: exists on IAuthRemote
		logout: () => remoteAuth.logout(),
	} satisfies IAuthLocal)
}
