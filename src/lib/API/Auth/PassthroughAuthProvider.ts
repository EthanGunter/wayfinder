import { type NotImplementedError, type ArgumentError, type NotFoundError, Err, InvalidStateError } from "$domain/errors";
import type { IAuth, IAuthLocal, LocalUser, LoginCredentials, LoginMethod, RegistrationRequirements, User } from "$domain/models/user";
import { err, type Result } from "$domain/result";
import { get } from "svelte/store";

/** Skips the optimistic update paths for local provider and calls the remote provider where possible */
export function getApi(localAuth: IAuthLocal, remoteAuth: IAuth): IAuthLocal {
	if (!localAuth) Err.throw(new InvalidStateError("Cannot use PassthroughAuthProvider without local auth provider"));
	if (!remoteAuth) Err.throw(new InvalidStateError("Cannot use PassthroughAuthProvider without remote auth provider"));

	return ({
		/* Local storage dependant */
		getUser: async function (): Promise<Result<LocalUser, InvalidStateError>> {
			const [user, error] = await localAuth.getUser();
			if (error) return err(error);

			return remoteAuth.getUser({ id: user.id })
		},
		switchUser: function (newUser: string): Promise<Result<LocalUser, NotFoundError>> {
			return localAuth.switchUser(newUser)
		},
		removeCachedUser: function (userId: string): Promise<void> {
			return localAuth.removeCachedUser(userId)
		},

		/* Passthroughable */
		register: function (params: { creds: LoginCredentials; userData: LocalUser; }): Promise<Result<User, NotImplementedError | ArgumentError>> {
			return remoteAuth.register(params);
		},
		getRegistrationRequirements: function (method: LoginMethod): Result<RegistrationRequirements[], NotImplementedError> {
			return remoteAuth.getRegistrationRequirements(method);
		},
		updateUser: async function ({ update }): Promise<Result<User, NotFoundError>> {
			const [user, error] = await localAuth.getUser();
			if (error) return err(error);
			return remoteAuth.updateUser({ update: { id: user.id, ...update } })
		},
		handleUpdateUserResponse: function (response: Result<void, { oldUser: LocalUser; }>): Promise<void> {
			// No op
			return Promise.resolve();
		},
		deleteUser: function ({ userId }): Promise<Result<void, NotFoundError>> {
			return remoteAuth.deleteUser({ userId })
		},
		handleDeleteUserResponse: function (response: Result<void, { oldUser: LocalUser; }>): Promise<void> {
			// No op
			return Promise.resolve();
		},
		login: function (params: { creds: LoginCredentials; }): Promise<Result<User, NotFoundError | ArgumentError | NotImplementedError>> {
			return remoteAuth.login(params)
		},
		logout: function (): Promise<Result<void>> {
			return remoteAuth.logout();
		}
	})
}
