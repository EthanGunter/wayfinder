import { dbPromise, type LocalDB } from '../localDB';
import { ArgumentError, Err, InputRequiredError, InvalidStateError, NotFoundError, NotImplementedError } from '$domain/errors';
import { writable, get, readable, derived } from 'svelte/store';
import { USER_TABLE_NAME } from '../DBConstants';
import { cachedUsers, remoteAuth } from '.';
import { err, ok } from '$domain/result';
import { isAnonymous, type SessionUser, type LoginCredentials } from '$domain/models/user';
import type { AuthState, IAuthLocal, LiveStore } from './seam-interfaces';
import { isSessionCapable } from './seam-interfaces';

// Store session material mapping: userId -> sessionMaterial (refresh token)
const _cachedUserIds = writable<string[]>([]);

// Lazy init to avoid circular dependency with index.ts
export const passthroughAuthState: LiveStore<AuthState> = readable(
	{ status: "loading" } as AuthState,
	(set) => {
		// Defer access to remoteAuth until first subscription (after module initialization)
		const unsubscribe = remoteAuth.watchAuthState().subscribe((state) => set(state));
		return unsubscribe;
	}
);

// Live user data from remote, fetched by cached user IDs
export const passthroughCachedUsers = derived(
	_cachedUserIds,
	($ids, set) => {
		if ($ids.length === 0) {
			set([]);
			return;
		}
		const unsubscribe = remoteAuth.watchUsers({ ids: $ids }).subscribe(async (users) => {
			if (users.status === 'resolved') {
				try {
					let sessionList: { session: { token: string, userId: string, expiresAt: Date | string }, user: { id: string } }[] = [];
					if (isSessionCapable(remoteAuth)) {
						const [dto, dtoErr] = await remoteAuth.getUserSessions();
						if (!dtoErr) sessionList = dto as any;
					}
					const mapped: SessionUser[] = (users.value as any[]).map((u) => {
						const match = sessionList.find((s) => s.user.id === u.id || s.session.userId === u.id);
						if (match) {
							const expiresAt = match.session.expiresAt instanceof Date ? match.session.expiresAt : new Date(match.session.expiresAt);
							const isActive = Date.now() < expiresAt.getTime();
							return {
								...u,
								sessionStatus: isActive ? 'active' : 'expired',
								expiresAt,
								sessionRefreshMaterial: match.session.token,
							} as SessionUser;
						}
						return { ...u, sessionStatus: 'revoked' } as SessionUser;
					});
					set(mapped);
				} catch {
					set((users.value as any[]).map((u) => ({ ...u, sessionStatus: 'revoked' })) as SessionUser[]);
				}
			}
		});
		return () => unsubscribe();
	},
	[] as SessionUser[]
);

// Module state
let db: LocalDB | null = null;

// Module-load hydration
(async () => {
	db = await dbPromise;

	// Hydrate cached user IDs from DB
	const allKeys = await db.getAllKeys(USER_TABLE_NAME) as string[];
	_cachedUserIds.set(allKeys);

	// Subscribe to remote auth state changes to cache session material
	remoteAuth.watchAuthState().subscribe(async (state) => {
		if (state.status === 'signed-in' && db) {
			const userId = state.user.id;

			// Ensure userId exists in local cache for selector hydration
			const exists = await db.get(USER_TABLE_NAME, userId);
			if (!exists) {
				await db.put(USER_TABLE_NAME, { id: userId } as any);
				const currentIds = get(_cachedUserIds);
				if (!currentIds.includes(userId)) {
					_cachedUserIds.set([...currentIds, userId]);
				}
				const allCachedAfter = await db.getAllKeys(USER_TABLE_NAME);
			}
		}
	});
})();

const api: IAuthLocal = {
	watchAuthState: () => {
		return passthroughAuthState;
	},

	register: async ({ creds, userData }: { creds: LoginCredentials, userData: SessionUser }) => {
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
		const [_, regErr] = await remoteAuth.register({ creds, userData });
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
	sendResetPassword: async (email: string) => remoteAuth.sendResetPassword(email),
	resetPassword: async (token: string, newPassword: string) => remoteAuth.resetPassword(token, newPassword),
	getRegistrationRequirements: (signUpCred: any) => {
		return remoteAuth.getRegistrationRequirements(signUpCred);
	},

	switchUser: async (newUserId: string) => {
		if (!isSessionCapable(remoteAuth)) {
			return err(new NotImplementedError("Session restoration not supported"));
		}
		if (!newUserId || newUserId == '') {
			Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use logout if you want no active user"));
		}

		// Check if already active
		const activeId = getActiveUserId();
		if (newUserId === activeId) {
			const state = get(remoteAuth.watchAuthState());
			return state.status === 'signed-in' ? ok(state.user) : err(new NotFoundError(newUserId, "User"));
		}

		// Check if user is cached
		const cached = get(cachedUsers).find((u) => u.id === newUserId);
		if (!cached) Err.throw(new NotFoundError(newUserId, "Cached User"));

		if (cached.sessionStatus === 'revoked' || (cached.sessionStatus === 'active' && cached.expiresAt < new Date())) {
			return err(new InputRequiredError('Cached user session expired', { userId: newUserId }));
		}

		const material = cached.sessionRefreshMaterial;

		if (!material) {
			return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
		}

		// Attempt to restore remote session
		try {
			const [res, resErr] = await remoteAuth.restoreSession({ userId: newUserId, material });
			if (resErr) {
				return err(resErr);
			}

			// If rotated, just trigger re-enrichment by bumping ids
			const rotated = res.rotatedMaterial;
			if (rotated && rotated !== material) {
				const ids = get(_cachedUserIds);
				_cachedUserIds.set([...ids]);
			}

			// Return the user from remote state (will be updated after session restore)
			const state = get(remoteAuth.watchAuthState());
			return state.status === 'signed-in' ? ok(state.user) : err(new NotFoundError(newUserId, "User"));
		} catch (e) {
			return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
		}
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

	handleUpdateUserResponse: async (_response: any) => {
		// No-op: we don't do optimistic updates, so no rollback needed
	},

	deleteUser: async ({ userId }) => {
		const activeUserId = getActiveUserId();
		// Can't delete the current user
		if (userId === activeUserId) {
			await api.logout();
		}

		// Delete remote first
		const [_, remoteErr] = await remoteAuth.deleteUser({ userId });
		if (remoteErr) {
			return err(remoteErr);
		}

		// Remove from local cache
		await api.removeCachedUser(userId);

		return ok(undefined);
	},

	handleDeleteUserResponse: async (_response: any) => {
		// No-op: we don't do optimistic updates, so no rollback needed
	},

	removeCachedUser: async (userId: string): Promise<void> => {
		assertDB(db);

		// Remove user ID from cache
		await db.delete(USER_TABLE_NAME, userId);
		const currentIds = get(_cachedUserIds);
		_cachedUserIds.set(currentIds.filter(id => id !== userId));
	},

	login: async (creds) => {
		// Remote login (triggers redirect to WorkOS)
		const [_, loginErr] = await remoteAuth.login(creds);
		if (loginErr) {
			return err(loginErr);
		}

		// Note: User will be automatically cached by the auth state subscription
		// after the WorkOS callback completes and auth state changes to signed-in
		return ok();
	},

	logout: async (options?: { keepCached?: boolean }) => {
		const activeId = getActiveUserId();

		// Invalidate remote session (clears cookie + WorkOS session)
		await remoteAuth.logout(options);

		// Remove the session material from local cache (unless keepCached is true)
		if (activeId && !options?.keepCached) {
			await api.removeCachedUser(activeId);
		} else if (activeId && options?.keepCached) {
		}
	}
}

export default api;

// #region UTILITIES

// Helper to get active user ID from remote auth state
function getActiveUserId(): string | undefined {
	const state = get(remoteAuth.watchAuthState());
	return state.status === 'signed-in' ? state.user.id : undefined;
}



function assertDB(db: LocalDB | null, errorMessage?: string): asserts db is LocalDB {
	if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use PassthroughAuthProvider without a db connection"));
}

// #endregion
