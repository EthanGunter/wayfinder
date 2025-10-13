import { derived, readable, writable } from "svelte/store";
import {
	type AuthState,
	type Fetchable,
	type IAuthRemote,
	type IAuthSessionCapable,
	type LiveStore,
} from "./seam-interfaces";
import type {
	User,
	RegistrationRequirements,
} from "$domain/models/user";
import {
	Err,
	InputRequiredError,
	type NotImplementedError,
} from "$domain/errors";
import { err, ok, type Result } from "$domain/result";

import { api } from "$convex/_generated/api";
import { ConvexClient } from "convex/browser";
import { PUBLIC_AUTH_URL, PUBLIC_CONVEX_URL } from "$env/static/public";
import { createAuthClient } from 'better-auth/svelte';
import { convexClient } from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [convexClient()],
});

// Internal auth state - managed by BetterAuth session
const authState = writable<AuthState>({ status: "loading" });
let unsubUser: (() => void) | null = null;
let client = new ConvexClient(PUBLIC_CONVEX_URL);

const resolveSignedOut = () => {
	if (unsubUser) {
		unsubUser();
		unsubUser = null;
		console.log("Unsubscribed from user");
	}
	// Clear Convex auth - provide fetcher that returns null token
	client.setAuth(async () => null);
	authState.set({ status: "signed-out" });
};

const bootstrap = async () => {
	console.log("[ConvexAuthProvider] bootstrap");

	try {
		// Get session from BetterAuth
		const session = await authClient.getSession();

		// TODO:debug EG - Log full session structure to find Convex token
		console.log("[ConvexAuthProvider] TODO:debug - Full session object:", JSON.stringify(session, null, 2));

		if (!session?.data?.user?.id) {
			console.log("[ConvexAuthProvider] No session found");
			resolveSignedOut();
			return;
		}

		const userId = session.data.user.id;
		console.log("BetterAuth session found for user:", userId);
		// Ensure Convex client has the latest auth token
		client.setAuth(async () => {
			try {
				const resp = await fetch(`${PUBLIC_AUTH_URL}/convex/token`, {
					credentials: "include",
				});
				if (!resp.ok) return null;
				const { token } = await resp.json();
				return token ?? null;
			} catch {
				return null;
			}
		});
		// Ensure user record exists in our app DB (creates if first-time login)
		// This mutation validates auth internally via ctx.auth.getUserIdentity()
		await client.mutation(api.users.ensureCurrentUser, {});

		// Subscribe to user from Convex
		unsubUser = client.onUpdate(
			api.users.watchUser,
			{ id: userId },
			(user) => {
				console.log('[ConvexAuthProvider] User update:', user);
				if (!user) {
					authState.set({ status: "loading" });
					return;
				}
				authState.set({
					status: "signed-in",
					user: { ...user, createdAt: new Date(user._creationTime) }
				});
			},
			(error: Error) => {
				authState.set({
					status: "error",
					error: {
						type: "NetworkError",
						message: error.message,
						ctx: { original: error },
					} as any,
				});
			}
		);
	} catch (e: any) {
		console.error("[ConvexAuthProvider] Bootstrap failed:", e);
		resolveSignedOut();
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
			const unsubscribe = client.onUpdate(
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
						error: {
							type: "NetworkError",
							message: error.message,
							ctx: { original: error },
						} as any,
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
		console.log("[ConvexAuthProvider] register user");
		// For now, registration uses GitHub OAuth
		// BetterAuth will create the auth user, then we create our app user record
		await authClient.signIn.social({ provider: 'github', callbackURL: window.location.origin + '/planner' });
		// After OAuth completes and redirects back, the session will be active
		// and bootstrap will be triggered to create/fetch the user
		return ok();
	},

	updateUser: async ({ update }) => {
		const res = await client.mutation(api.users.updateUser, update);
		if (res.ok) return ok(res.value);
		return err(res.error);
	},

	deleteUser: async ({ userId }) => {
		const res = await client.mutation(api.users.deleteUser, { userId });
		if (res.ok) return ok();
		return err(res.error);
	},

	login: async (creds) => {
		console.log("[ConvexAuthProvider] login user");
		// TODO:debug EG - Log the exact URL being called
		const callbackURL = window.location.origin + '/planner';
		console.log('[ConvexAuthProvider] TODO:debug - authClient config:', {
			callbackURL,
			windowOrigin: window.location.origin,
			authClientKeys: Object.keys(authClient)
		});
		// GitHub OAuth login
		try {
			await authClient.signIn.social({ provider: 'github' });
			console.log('[ConvexAuthProvider] TODO:debug - signIn.social completed without error');
		} catch (e: any) {
			console.error('[ConvexAuthProvider] TODO:debug - signIn.social threw error:', e);
			throw e;
		}
		return ok();
	},

	logout: async (options?: { keepCached?: boolean }) => {
		console.log("[ConvexAuthProvider] logout");
		try {
			// Sign out via BetterAuth
			await authClient.signOut();

			// Clear Convex auth and update UI
			resolveSignedOut();

			// For multi-account support, if keepCached is true, we don't fully redirect
			if (!options?.keepCached) {
				// Optionally redirect to login page
				// window.location.href = '/login';
			}
		} catch (e) {
			console.error("Failed to sign out:", e);
			// Still update UI even if server call failed
			resolveSignedOut();
		}
	},

	// Session-capable methods for account switching
	// TODO: BetterAuth multi-session support needs to be implemented
	// For now, these are stubs that maintain the interface
	getSessionMaterial: async ({ userId }: { userId: string }) => {
		console.log("[ConvexAuthProvider] getSessionMaterial - TODO: implement with BetterAuth");
		// BetterAuth stores sessions in httpOnly cookies
		// For multi-account, we'll need to implement session storage on the server
		// or use BetterAuth's multi-session capabilities
		return ok(null);
	},

	restoreSession: async ({ userId, material }: { userId: string; material: string }) => {
		console.log("[ConvexAuthProvider] restoreSession - TODO: implement with BetterAuth");
		// For multi-account switching, we need to:
		// 1. Store multiple session tokens server-side
		// 2. Use an identifier to switch between them
		// 3. Set the active session cookie

		// For now, just re-bootstrap
		await bootstrap();
		return ok({ rotatedMaterial: undefined });
	},
};

export default convexApi;


// Helper to build LiveStore from onUpdate subscription
function toLiveStore<T>(
	queryRef: any,
	args: any,
	notFoundValue: Fetchable<T>,
): LiveStore<Fetchable<T>> {
	return readable<Fetchable<T>>({ status: "loading" }, (set) => {
		const unsubscribe = client.onUpdate(
			queryRef,
			args,
			(dataFromServer: T | null) => {
				if (dataFromServer === null) {
					set(notFoundValue);
				} else {
					set({ status: "resolved", data: dataFromServer });
				}
			},
			(error: Error) => {
				set({
					status: "error",
					error: {
						type: "NetworkError",
						message: error.message,
						ctx: { original: error },
					} as any,
				});
			},
		);
		return unsubscribe;
	});
}