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
import { PUBLIC_CONVEX_URL, PUBLIC_CONVEX_API_URL } from "$env/static/public";
import { authkit } from "../WorkOSAuthKit";

const client = new ConvexClient(PUBLIC_CONVEX_URL);

// Internal auth state - managed by bootstrap and mutations
const authState = writable<AuthState>({ status: "loading" });
let unsubUser: (() => void) | null = null;

const resolveSignedOut = () => {
	if (unsubUser) {
		unsubUser();
		unsubUser = null;
		console.log("Unsubscribed from user");
	}
	authState.set({ status: "signed-out" });
};

const bootstrap = async () => {
	console.log("[ConvexAuthProvider] bootstrap");

	try {
		// Verify identity from cookie
		const res = await fetch(`${PUBLIC_CONVEX_API_URL}/auth/whoami`, {
			credentials: "include",
		});

		const json = await res.json();
		console.log("whoami res:", json);
		const { userId } = json;

		if (!userId) {
			resolveSignedOut();
			return;
		}

		// User row already upserted by callback; subscribe directly
		console.log("Subscribing to user");

		unsubUser = client.onUpdate(
			api.users.watchUser,
			{ id: userId },
			(user) => {
				console.log('[TODO:debug EG] ConvexAuthProvider onUpdate callback, user:', user); // TODO:debug EG
				if (!user) {
					authState.set({ status: "loading" });
					return;
				}
				console.log('[TODO:debug EG] ConvexAuthProvider calling set with signed-in'); // TODO:debug EG
				authState.set({ status: "signed-in", user: { ...user, createdAt: new Date(user._creationTime) } });
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
		resolveSignedOut();
	}
};

// Re-check when page becomes visible again (in case cookie rotates)
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
		await authkit.signIn();
		await client.mutation(api.users.register, { creds, userData });
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
		authkit.signIn()
		return ok();
	},

	logout: async (options?: { keepCached?: boolean }) => {
		// Clear our app's cookie AND revoke WorkOS session
		try {
			const response = await fetch(`${PUBLIC_CONVEX_API_URL}/auth/signout`, {
				method: "POST",
				credentials: "include",
			});

			const data = await response.json();
			console.log("[ConvexAuthProvider] Signout response:", data);

			// Update UI immediately
			resolveSignedOut();

			// Redirect to WorkOS logout URL to clear their browser session
			// Skip redirect if keepCached is true (we're switching users, not fully logging out)
			if (data.logoutUrl && !options?.keepCached) {
				console.log("[ConvexAuthProvider] Redirecting to WorkOS logout:", data.logoutUrl);
				window.location.href = data.logoutUrl;
			} else if (options?.keepCached) {
				console.log("[ConvexAuthProvider] Keeping cached - no WorkOS redirect");
			}
		} catch (e) {
			console.error("Failed to clear session:", e);
			// Still update UI even if server call failed
			resolveSignedOut();
		}
	},

	// Session-capable methods for account switching
	getSessionMaterial: async ({ userId }: { userId: string }) => {
		try {
			const response = await fetch(`${PUBLIC_CONVEX_API_URL}/auth/session-material`, {
				method: "GET",
				credentials: "include", // Send HttpOnly cookie
			});

			const data = await response.json();
			return ok(data.material || null);
		} catch (e) {
			console.error("Failed to get session material:", e);
			return ok(null);
		}
	},

	restoreSession: async ({ userId, material }: { userId: string; material: string }) => {
		// Set the cookie with the saved session material
		// Note: We can't set HttpOnly cookies from JavaScript, so we need a server endpoint
		const response = await fetch(`${PUBLIC_CONVEX_API_URL}/auth/restore-session`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ material }),
		});

		if (response.status === 401) {
			return err(new InputRequiredError('Session expired. Please log in again.', { userId }))
		} else if (!response.ok) {
			return Err.UNHANDLED(response);
		}

		// Trigger bootstrap to update auth state
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