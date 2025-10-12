import { dbPromise, type LocalDB } from '../localDB';
import { ArgumentError, Err, InputRequiredError, InvalidStateError, NotFoundError } from '$domain/errors';
import SessionVault from './SessionVault';
import { writable, get, readable, derived } from 'svelte/store';
import { USER_TABLE_NAME } from '../DBConstants';
import { remoteAuth } from '.';
import { err, ok } from '$domain/result';
import { isAnonymous, type LocalUser, type LoginCredentials } from '$domain/models/user';
import type { AuthState, IAuthLocal, LiveStore } from './seam-interfaces';
import { isSessionCapable } from './seam-interfaces';

// Store session material mapping: userId -> sessionMaterial (refresh token)
const _cachedUserIds = writable<string[]>([]);

// Lazy init to avoid circular dependency with index.ts
export const passthroughAuthState: LiveStore<AuthState> = readable(
	{ status: "loading" } as AuthState,
	(set) => {
		// Defer access to remoteAuth until first subscription (after module initialization)
		console.log('[TODO:debug EG] PassthroughAuthProvider: subscribing to remoteAuth.watchAuthState()'); // TODO:debug EG
		const unsubscribe = remoteAuth.watchAuthState().subscribe((state) => {
			console.log('[TODO:debug EG] PassthroughAuthProvider received state update:', state.status); // TODO:debug EG
			set(state);
		});
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
		const unsubscribe = remoteAuth.watchUsers({ ids: $ids }).subscribe((fetchable) => {
			console.log(`Watch users updated`, fetchable);

			if (fetchable.status === 'resolved') {
				set(fetchable.data as LocalUser[]);
			}
		});
		return () => unsubscribe();
	},
	[] as LocalUser[]
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

			// TODO:debug EG - Check all cached users before processing
			const allCachedBefore = await db.getAllKeys(USER_TABLE_NAME);
			console.log('[TODO:debug EG] Auth state changed to signed-in, userId:', userId, 'cached users before:', allCachedBefore); // TODO:debug EG

			// Check if user is already cached
			const existingSession = await SessionVault.get(userId);
			if (!existingSession) {
				// New user - cache session material
				const sessionMaterial = await getSessionMaterialFromCookie();
				if (sessionMaterial) {
					await SessionVault.save(userId, sessionMaterial);

					// Mark this user as cached by storing a minimal marker object
					// The USER_TABLE_NAME store uses keyPath: "id", so we include it in the object
					await db.put(USER_TABLE_NAME, { id: userId } as any);
					const currentIds = get(_cachedUserIds);
					if (!currentIds.includes(userId)) {
						_cachedUserIds.set([...currentIds, userId]);
					}
					console.log('[PassthroughAuthProvider] Cached new user session:', userId);
					
					// TODO:debug EG - Verify cache after adding
					const allCachedAfter = await db.getAllKeys(USER_TABLE_NAME);
					console.log('[TODO:debug EG] Cached users after adding new user:', allCachedAfter); // TODO:debug EG
				}
			} else {
				console.log('[TODO:debug EG] User already cached, skipping:', userId); // TODO:debug EG
			}
		}
	});
})();

const api: IAuthLocal = {
	watchAuthState: () => {
		return passthroughAuthState;
	},

	register: async ({ creds, userData }: { creds: LoginCredentials, userData: LocalUser }) => {
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

	getRegistrationRequirements: (signUpCred: any) => {
		return remoteAuth.getRegistrationRequirements(signUpCred);
	},

	switchUser: async (newUserId: string) => {
		if (!newUserId || newUserId == '') {
			Err.throw(new ArgumentError(newUserId, "UserId required to switch user. Use logout if you want no active user"));
		}

		// Check if already active
		const activeId = getActiveUserId();
		if (newUserId === activeId) {
			console.log('[TODO:debug EG] switchUser: already active user', newUserId); // TODO:debug EG
			const state = get(remoteAuth.watchAuthState());
			return state.status === 'signed-in' ? ok(state.user) : err(new NotFoundError(newUserId, "User"));
		}

		// Logout current user first (keep cached) to clear session before switching
		if (activeId) {
			console.log('[TODO:debug EG] switchUser: logging out current user (keepCached=true)', activeId); // TODO:debug EG
			await api.logout({ keepCached: true });
		}

		// Check if user is cached
		const material = await SessionVault.get(newUserId);
		console.log('[TODO:debug EG] switchUser: session material exists?', !!material); // TODO:debug EG
		if (!material) {
			return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
		}

		// Attempt to restore remote session
		if (isSessionCapable(remoteAuth)) {
			try {
				console.log('[TODO:debug EG] switchUser: restoring session for user', newUserId); // TODO:debug EG
				const [res, resErr] = await remoteAuth.restoreSession({ userId: newUserId, material });
				if (resErr) {
					console.log('[TODO:debug EG] switchUser: session restore failed', resErr); // TODO:debug EG
					return err(resErr);
				}

				// Update session material if rotated
				const rotated = res.rotatedMaterial;
				if (rotated && rotated !== material) {
					await SessionVault.save(newUserId, rotated);
				}

				// Return the user from remote state (will be updated after session restore)
				const state = get(remoteAuth.watchAuthState());
				console.log('[TODO:debug EG] switchUser: session restored, new auth state', state.status); // TODO:debug EG
				return state.status === 'signed-in' ? ok(state.user) : err(new NotFoundError(newUserId, "User"));
			} catch (e) {
				console.log('[TODO:debug EG] switchUser: exception during restore', e); // TODO:debug EG
				return err(new InputRequiredError('Login required to access this account', { userId: newUserId }));
			}
		}

		return err(new InputRequiredError('Session restoration not supported', { userId: newUserId }));
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

		// Remove session material
		await SessionVault.remove(userId);

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
			console.log('[TODO:debug EG] logout: removing cached user', activeId); // TODO:debug EG
			await api.removeCachedUser(activeId);
		} else if (activeId && options?.keepCached) {
			console.log('[TODO:debug EG] logout: keeping cached user', activeId); // TODO:debug EG
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

// Helper to get session material from the current cookie
async function getSessionMaterialFromCookie(): Promise<string | undefined> {
	if (!isSessionCapable(remoteAuth)) return undefined;

	// Get session material via the remote auth provider
	// This calls the server endpoint that extracts the access token from the HttpOnly cookie
	const activeId = getActiveUserId();
	if (!activeId) return undefined;

	const [material, err] = await remoteAuth.getSessionMaterial({ userId: activeId });
	if (err || !material) return undefined;

	return material;
}

function assertDB(db: LocalDB | null, errorMessage?: string): asserts db is LocalDB {
	if (!db) Err.throw(new InvalidStateError(errorMessage ?? "Attempted to use PassthroughAuthProvider without a db connection"));
}

// #endregion
