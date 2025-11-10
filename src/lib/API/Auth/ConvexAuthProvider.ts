import { derived, get, readable, writable } from "svelte/store";
import {
	type AuthState,
	type IAuthRemote,
	type IAuthSessionCapable,
	type LiveStore,
} from "./seam-interfaces";
import type {
	User,
	RegistrationRequirements,
	SessionUser,
} from "$domain/models/user";
import {
	Err,
	InputRequiredError,
	InvalidStateError,
	type NotImplementedError,
} from "$domain/errors";
import { err, ok, type Result } from "$domain/result";

import { api } from "$convex/_generated/api";
import { createAuthClient } from 'better-auth/svelte';
import { convexClient as convexPlugin } from "@convex-dev/better-auth/client/plugins";
import { multiSessionClient } from "better-auth/client/plugins";
import { page } from "$app/state";
import { cachedUsers } from ".";
import { sharedConvexClient } from "../ConvexClient";
import { PUBLIC_SITE_URL } from "$env/static/public";
import type { Fetchable } from "$domain/fetchable";

const authClient = createAuthClient({
	plugins: [convexPlugin(), multiSessionClient()],
});

// Internal auth state - managed by BetterAuth session
const authState = writable<AuthState>({ status: "loading" });
let unsubUser: (() => void) | null = null;
let subscribedUserId: string | null = null;

const resolveSignedOut = () => {
	if (unsubUser) {
		unsubUser();
		unsubUser = null;
	}
	// Clear Convex auth - provide fetcher that returns null token
	sharedConvexClient.setAuth(async () => null);
	authState.set({ status: "signed-out" });
};

const bootstrap = async () => {
	try {
		// Get session from BetterAuth
		const session = await authClient.getSession();

		if (!session?.data?.user?.id) {
			resolveSignedOut();
			return;
		}

		const userId = session.data.user.id;
		// Ensure Convex client has the latest auth token
		sharedConvexClient.setAuth(async () => {
			try {
				// TODO will this result in a double slash and fail to fetch?
				const resp = await fetch(`${PUBLIC_SITE_URL}/api/auth/convex/token`, {
					credentials: "include",
				});
				if (!resp.ok) return null;
				const { token } = await resp.json();
				return token ?? null;
			} catch (e) {
				return null;
			}
		});
		// Ensure user record exists in our app DB (creates if first-time login)
		// This mutation validates auth internally via ctx.auth.getUserIdentity()
		await sharedConvexClient.mutation(api.users.ensureCurrentUser, {});

		// Subscribe to user from Convex
		if (unsubUser) {
			unsubUser();
			unsubUser = null;
		}
		subscribedUserId = userId;
		unsubUser = sharedConvexClient.onUpdate(
			api.users.watchUser,
			{ id: userId },
			(user) => {
				if (!user) {
					authState.set({ status: "loading" });
					return;
				}
				(async () => {
					const { _creationTime, ...rest } = user;
					const normalized = { ...rest, createdAt: new Date(user._creationTime) } as User;

					let sessionUser: SessionUser;
					try {
						const device = await authClient.multiSession.listDeviceSessions();
						if (!device.error) {
							const match = device.data.find((s) => s.user.id === userId || s.session.userId === userId);
							if (match) {
								const expiresAt = new Date(match.session.expiresAt);
								const isActive = Date.now() < expiresAt.getTime();
								sessionUser = {
									...(normalized as any),
									sessionStatus: isActive ? 'active' : 'expired',
									expiresAt,
									sessionRefreshMaterial: match.session.token,
								} as SessionUser;
							} else {
								sessionUser = {
									...(normalized as any),
									sessionStatus: 'revoked',
								} as SessionUser;
							}
						} else {
							sessionUser = {
								...(normalized as any),
								sessionStatus: 'revoked',
							} as SessionUser;
						}
					} catch (e) {
						sessionUser = {
							...(normalized as any),
							sessionStatus: 'revoked',
						} as SessionUser;
					}
					authState.set({ status: 'signed-in', user: sessionUser });
				})();
			},
			(error: Error) => {
				authState.set({
					status: "error",
					error: Err.wrap(error),
				});
			}
		);
	} catch (e: any) {
		resolveSignedOut();
		Err.UNHANDLED("[ConvexAuthProvider] Bootstrap failed:", e);
	}
};

// Re-check when page becomes visible again
const onVis = () => {
	if (document.visibilityState === "visible") bootstrap();
};
document.addEventListener("visibilitychange", onVis);

// Bootstrap at module load
bootstrap();

const convexApi: IAuthRemote & IAuthSessionCapable = {
	watchAuthState: function (): LiveStore<AuthState> {
		return derived(authState, $state => $state);
	},

	watchUsers: ({ ids }: { ids: string[]; }): LiveStore<Fetchable<User[]>> => {
		return readable<Fetchable<User[]>>({ status: "loading" }, (set) => {
			const unsubscribe = sharedConvexClient.onUpdate(
				api.users.watchUsers,
				{ ids },
				(users) => {
					if (users === null) {
						set({ status: "resolved", data: [] });
					} else {
						// Transform Convex users to app User format (convert _creationTime to createdAt Date)
						const transformed: User[] = users.map((u) => ({
							...u,
							createdAt: new Date(u._creationTime),
							_creationTime: undefined
						}));
						set({ status: "resolved", data: transformed });
					}
				},
				(error: Error) => {
					set({
						status: "error",
						error: Err.wrap(error),
					});
				}
			);
			return unsubscribe;
		});
	},

	getRegistrationRequirements(creds): Result<RegistrationRequirements[], NotImplementedError> {
		return ok<RegistrationRequirements[]>([]);
	},

	register: async ({ creds, userData }) => {
		if (creds.type === 'external') {
			// Social registration
			Err.NotImplemented('Social auth temporarily disabled');
			await authClient.signIn.social({ provider: 'github', callbackURL: page.url.pathname });
		} else if (creds.type === 'email_password') {
			// Email/password registration — BetterAuth requires name in some configs; keep to sign-in only for now
			const res = await authClient.signUp.email({
				name: userData.displayName,
				email: creds.email,
				password: creds.password,
				image: userData.avatarUrl,
			});
			if (res.error && res.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
				// TODO attempt to login with the email and password
				const loginRes = await authClient.signIn.email({
					email: creds.email,
					password: creds.password,
				});
				if (loginRes.error) throw loginRes.error;
			}
			bootstrap();
		}
		// After OAuth completes and redirects back, the session will be active
		// and bootstrap will be triggered to create/fetch the user
		return ok();
	},

	updateUser: async ({ update }) => {
		const res = await sharedConvexClient.mutation(api.users.updateUser, update);
		if (res.ok) return ok(res.value);
		return err(res.error);
	},

	deleteUser: async ({ userId }) => {
		const res = await sharedConvexClient.mutation(api.users.deleteUser, { userId });
		if (res.ok) return ok();
		return err(res.error);
	},

	login: async (creds) => {
		try {
			if (creds.type === 'external') {
				// GitHub OAuth login
				Err.NotImplemented('Social auth temporarily disabled');
				const res = await authClient.signIn.social({ provider: 'github' });
				if (res.error) throw res.error;
			} else if (creds.type === 'email_password') {
				const res = await authClient.signIn.email({
					email: creds.email,
					password: creds.password,
				});
				if (res.error) throw res.error;
				bootstrap();
			}
		} catch (e: any) {
			Err.UNHANDLED('[ConvexAuthProvider] signIn error:', e);
		}
		return ok();
	},

	logout: async () => {
		try {
			// Clear Convex auth and update UI
			resolveSignedOut();

			// Sign out via BetterAuth
			await authClient.signOut();
		} catch (e) {
			// Still update UI even if server call failed
			resolveSignedOut();
			Err.UNHANDLED(e, "Failed to sign out");
		}
	},

	// Session-capable methods for account switching
	// TODO: BetterAuth multi-session support needs to be implemented
	// For now, these are stubs that maintain the interface
	getSessionMaterial: async ({ userId }: { userId: string }) => {
		try {
			const res = await authClient.multiSession.listDeviceSessions();
			if (res.error) return err(new InvalidStateError('Unable to list sessions'));
			const match = res.data.find((s) => s.user.id === userId || s.session.userId === userId);
			return ok<string | null>(match?.session.token ?? null);
		} catch (e) {
			return err(new InvalidStateError('Unable to list sessions'));
		}
	},

	restoreSession: async ({ userId, material }: { userId: string; material: string }) => {
		try {
			await authClient.multiSession.setActive({ sessionToken: material });
			// Ensure Convex receives a fresh JWT tied to the active BetterAuth session
			await sharedConvexClient.mutation(api.users.ensureCurrentUser, {});
			// Re-subscribe to the now-active user's data
			const session = await authClient.getSession();
			const newUserId = session?.data?.user?.id;
			if (newUserId && newUserId !== subscribedUserId) {
				if (unsubUser) {
					unsubUser();
					unsubUser = null;
				}
				authState.set({ status: 'loading' });
				subscribedUserId = newUserId;
				unsubUser = sharedConvexClient.onUpdate(
					api.users.watchUser,
					{ id: newUserId },
					(user) => {
						if (!user) {
							authState.set({ status: 'loading' });
							return;
						}
						(async () => {
							const normalized = { ...user, createdAt: new Date(user._creationTime) } as any;
							let enriched: SessionUser;
							try {
								const device = await authClient.multiSession.listDeviceSessions();
								if (!device.error) {
									const match = device.data.find((s) => s.user.id === newUserId || s.session.userId === newUserId);
									if (match) {
										const expiresAt = new Date(match.session.expiresAt);
										const isActive = Date.now() < expiresAt.getTime();
										enriched = { ...(normalized as any), sessionStatus: isActive ? 'active' : 'expired', expiresAt, sessionRefreshMaterial: match.session.token } as SessionUser;
									} else {
										enriched = { ...(normalized as any), sessionStatus: 'revoked' } as SessionUser;
									}
								} else {
									enriched = { ...(normalized as any), sessionStatus: 'revoked' } as SessionUser;
								}
							} catch {
								enriched = { ...(normalized as any), sessionStatus: 'revoked' } as SessionUser;
							}
							authState.set({ status: 'signed-in', user: enriched });
						})();
					},
					(error: Error) => {
						authState.set({ status: 'error', error: Err.wrap(error) });
					}
				);
			}
			return ok({ rotatedMaterial: undefined });
		} catch (e) {
			return err(new InputRequiredError('Failed to activate session', { userId }));
		}
	},

	// List sessions in an interface-safe DTO
	getUserSessions: async () => {
		try {
			const res = await authClient.multiSession.listDeviceSessions();
			if (res.error) return err(new InvalidStateError('Unable to list sessions'));
			const cached = get(cachedUsers);

			const mapped = res.data.map((s) => ({
				session: { token: s.session.token, userId: s.session.userId, expiresAt: new Date(s.session.expiresAt) },
				user: {
					...cached.find(u => u.id === s.user.id),
					id: s.user.id,
					displayName: s.user.name,
					avatarUrl: s.user.image ?? undefined,
				},
			}));
			return ok(mapped);
		} catch (e) {
			return err(new InvalidStateError('Unable to list sessions'));
		}
	},
};

export default convexApi;
