import { derived, readable, writable } from "svelte/store";
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
	UpdateErr,
	EnsureUserErr,
} from "$domain/models/user";
import {
	ArgumentError,
	Err,
	InputRequiredError,
	InvalidStateError,
	NotAuthorizedError,
	UnknownError,
	NotFoundError,
	type NotImplementedError,
} from "$domain/errors";
import { err, ok, type Result } from "$domain/result";

import { api } from "$convex/_generated/api";
import { createAuthClient } from 'better-auth/svelte';
import { convexClient as convexPlugin } from "@convex-dev/better-auth/client/plugins";
import { multiSessionClient } from "better-auth/client/plugins";
import { page } from "$app/state";
import { sharedConvexClient } from "../ConvexClient";
import { PUBLIC_SITE_URL } from "$env/static/public";
import type { Fetchable } from "$domain/fetchable";
import { ConvexError } from "convex/values";

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

const setupConvexAuth = () => {
	sharedConvexClient.setAuth(async () => {
		try {
			// TODO will this result in a double slash and fail to fetch?
			const resp = await fetch(`${PUBLIC_SITE_URL}/api/auth/convex/token`, {
				credentials: "include",
			});
			if (!resp.ok) return null;
			const { token } = await resp.json();
			return token ?? null;
		} catch {
			return null;
		}
	});
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
		setupConvexAuth();
		// Ensure user record exists in our app DB (creates if first-time login)
		// This action validates auth internally via ctx.auth.getUserIdentity()
		// Cast to any to bypass type mismatch until codegen updates (Mutation -> Action)
		await sharedConvexClient.action(api.users.ensureCurrentUser, {});

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
					const normalized = convertFromServerUser(user);

					let sessionUser: SessionUser;
					try {
						const device = await authClient.multiSession.listDeviceSessions();
						if (!device.error) {
							const match = device.data.find((s) => s.user.id === userId || s.session.userId === userId);
							if (match) {
								const expiresAt = new Date(match.session.expiresAt);
								const isActive = Date.now() < expiresAt.getTime();
								sessionUser = {
									...normalized,
									sessionStatus: isActive ? 'active' : 'expired',
									expiresAt,
									sessionRefreshMaterial: match.session.token,
								} as SessionUser;
							} else {
								sessionUser = {
									...normalized,
									sessionStatus: 'revoked',
								} as SessionUser;
							}
						} else {
							sessionUser = {
								...normalized,
								sessionStatus: 'revoked',
							} as SessionUser;
						}
					} catch (e) {
						sessionUser = {
							...normalized,
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
	} catch (e) {
		resolveSignedOut();
		console.error("[ConvexAuthProvider] Bootstrap failed:", e);
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
						set({ status: "resolved", value: [] });
					} else {
						set({ status: "resolved", value: users.map(convertFromServerUser) });
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

	getRegistrationRequirements(): Result<RegistrationRequirements[], NotImplementedError> {
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
			if (res.error) {
				if (res.error.code === authClient.$ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL) {
					// Attempt to login with the email and password
					const loginRes = await authClient.signIn.email({
						email: creds.email,
						password: creds.password,
					});
					if (loginRes.error) {
						// If login fails after "user already exists", it means the password was wrong
						return err(new ArgumentError("Account already exists and password does not match", creds));
					}
				} else {
					return err(new UnknownError(res.error.message || "Registration failed", { cause: res.error }));
				}
			}
			bootstrap();
		}
		// After OAuth completes and redirects back, the session will be active
		// and bootstrap will be triggered to create/fetch the user
		return ok();
	},

	sendResetPassword: async (email: string) => {
		const { data, error } = await authClient.requestPasswordReset({ email });

		if (error) {
			if (error.code === "VALIDATION_ERROR")
				return err(new ArgumentError("Invalid email address", email));
			return err(new UnknownError(error.message || 'Password reset failed', { cause: error }));
		}
		return ok({ userMessage: data.message });
	},
	resetPassword: async (token: string, newPassword: string) => {
		const res = await authClient.resetPassword({ token, newPassword });
		if (res.error) {
			if (res.error.code === "INVALID_TOKEN")
				return err(new NotAuthorizedError("This reset link is invalid or has expired. Please request a new one", { messageForDev: res.error.message }));
			else return err(new UnknownError(res.error.message || 'Reset failed', { cause: res.error }));
		}
		return ok();
	},

	updateUser: async ({ update }) => {
		try {
			const res = await sharedConvexClient.mutation(api.users.updateUser, convexifyUserUpdate(update));
			return ok(convertFromServerUser(res));
		}
		catch (e) {
			if (e instanceof ConvexError) {
				switch ((e.data as UpdateErr).type) {
					case "NotFoundError":
						return err(new NotFoundError("User not found", update.id));

				}
			}
			Err.AssertNever(e, "Unexpected update user error");
		}
	},

	deleteSelf: async () => {
		try {
			await sharedConvexClient.mutation(api.users.deleteSelf, {});
			await convexApi.logout();
			return ok();
		} catch (e) {
			if (e instanceof ConvexError) {
				if (e.data.type === "NotAuthorizedError") {
					return err(new InvalidStateError("No authenticated user to delete", { messageForDev: e.data.msg, ctx: {} }));
				}
			}
			Err.AssertNever(e, "Unexpected delete self error");
		}
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
				if (res.error) {
					console.log("res.error", res.error);
					if (res.error.code === authClient.$ERROR_CODES.INVALID_EMAIL_OR_PASSWORD || res.error.code === authClient.$ERROR_CODES.INVALID_PASSWORD) {
						return err(new ArgumentError("Invalid email or password", creds, { ctx: res.error }));
					}
					if (res.error.code === authClient.$ERROR_CODES.USER_NOT_FOUND) {
						return err(new NotFoundError("User not found", creds.email));
					}
					return err(new UnknownError(res.error.message || "Unknown error", { cause: res.error }));
				}

				// Verify Convex requirements (e.g. not deleted) before proceeding
				try {
					// Setup auth so the client can communicate as the user
					setupConvexAuth();

					// Cast to any to bypass type mismatch until codegen updates (Mutation -> Action)
					await sharedConvexClient.action(api.users.ensureCurrentUser, {});
				} catch (e) {
					await authClient.signOut();

					if (e instanceof ConvexError) {
						if (e.data.type === "NotAuthorizedError") {
							return err(new NotAuthorizedError("Not authenticated", { messageForDev: e.data.msg, ctx: creds }));
						} else if (e.data.type === "InvalidStateError") {
							if ((e.data as EnsureUserErr).msg === "No user session found") {
								return err(new NotAuthorizedError("Not authenticated", { messageForDev: "No user session found in ensureCurrentUser", ctx: creds }));
							}
						}
					}
					throw e;
				}

				bootstrap();
			}
		} catch (e) {
			if (e instanceof ConvexError) {
				if (e.data.type === "NotAuthorizedError") {
					return err(new NotAuthorizedError("Not authenticated", { messageForDev: e.data.msg, ctx: creds }));
				} else if (e.data.type === "InvalidStateError") {
					return err(new InvalidStateError("Account pending deletion. Try again tomorrow", { messageForDev: "authClient registration succeeded, but ctx.auth.getUserIdentity() returned null... why?", ctx: { creds } }));
				}
			} else if (e instanceof Error) {
				// TODO:security This error message contains the reason for the failure.
				// In production, we should probably not expose this to the user.
				return err(new UnknownError(e.message || 'Unknown sign-in error', { cause: e }));
			}
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
			console.error("Failed to sign out", e);
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
			// Cast to any to bypass type mismatch until codegen updates (Mutation -> Action)
			await sharedConvexClient.action(api.users.ensureCurrentUser, {});
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
							const normalized = convertFromServerUser(user);
							let enriched: SessionUser;
							try {
								const device = await authClient.multiSession.listDeviceSessions();
								if (!device.error) {
									const match = device.data.find((s) => s.user.id === newUserId || s.session.userId === newUserId);
									if (match) {
										const expiresAt = new Date(match.session.expiresAt);
										const isActive = Date.now() < expiresAt.getTime();
										enriched = { ...normalized, sessionStatus: isActive ? 'active' : 'expired', expiresAt, sessionRefreshMaterial: match.session.token } as SessionUser;
									} else {
										enriched = { ...normalized, sessionStatus: 'revoked' } as SessionUser;
									}
								} else {
									enriched = { ...normalized, sessionStatus: 'revoked' } as SessionUser;
								}
							} catch {
								enriched = { ...normalized, sessionStatus: 'revoked' } as SessionUser;
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
};

export default convexApi;


/**
 * Converts client user update to Convex format
 * Filters out fields that are not updatable via mutation (like createdAt)
 */
function convexifyUserUpdate(update: Partial<User> & { id: string }): Partial<User<number>> & { id: string } {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { createdAt, ...rest } = update;
	return {
		...rest,
	}
}

/**
 * Converts server user with number timestamps to client user with Date timestamps
 * Handles both _creationTime (from watchUser) and createdAt (from updateUser return)
 */
function convertFromServerUser(user: User<number>): User {
	return {
		...user,
		createdAt: new Date(user.createdAt),
	};
}
