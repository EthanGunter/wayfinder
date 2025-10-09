import { readable } from "svelte/store";
import {
	type AuthState,
	type Fetchable,
	type IAuthRemote,
	type LiveStore,
} from "./seam-interfaces";
import type {
	User,
	RegistrationRequirements,
} from "$domain/models/user";
import {
	type NotImplementedError,
} from "$domain/errors";
import { err, ok, type Result } from "$domain/result";

import { api } from "$convex/_generated/api";
import { ConvexClient } from "convex/browser";
import { PUBLIC_CONVEX_URL, PUBLIC_CONVEX_API_URL } from "$env/static/public";
import { authkit } from "$lib/API/WorkOSAuthKit";

const client = new ConvexClient(PUBLIC_CONVEX_URL);

const convexApi: IAuthRemote = {
	watchAuthState: function (): LiveStore<AuthState> {
		return readable<AuthState>({ status: "loading" }, (set) => {
			let unsubUser: (() => void) | null = null;
			let stopped = false;

			const resolveSignedOut = () => {
				if (unsubUser) {
					unsubUser();
					unsubUser = null;
				}
				set({ status: "signed-out", user: null });
			};

			const bootstrap = async () => {
				console.log("[ConvexAuthProvider] bootstrap");

				try {
					// 1) Ask Convex (server) who we are via cookie-verified endpoint
					const res = await fetch(`${PUBLIC_CONVEX_API_URL}/auth/whoami`, {
						credentials: "include",
					});
					const { userId } = await res.json();

					if (!userId) {
						resolveSignedOut();
						return;
					}

					// 2) Ensure a users row exists
					await fetch(`${PUBLIC_CONVEX_URL}/rpc/users.upsertCurrent`, {
						method: "POST",
						credentials: "include",
					});

					// 3) Live-subscribe to the user profile via authId
					unsubUser = client.onUpdate(
						api.users.watchUser,
						{ id: userId },
						(u: User | null) => {
							if (!u) {
								// Row missing momentarily; treat as loading or signed-out fallback
								set({ status: "loading" });
								return;
							}
							set({ status: "signed-in", user: u as any });
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
				} catch (e: any) {
					resolveSignedOut();
				}
			};

			// Kick off bootstrap
			bootstrap();

			// Optional: re-check when page becomes visible again (in case cookie rotates)
			const onVis = () => {
				if (document.visibilityState === "visible") bootstrap();
			};
			document.addEventListener("visibilitychange", onVis);

			return () => {
				stopped = true;
				document.removeEventListener("visibilitychange", onVis);
				if (unsubUser) unsubUser();
			};
		});
	},

	watchUsers: ({ ids }: { ids: string[]; }): LiveStore<Fetchable<User[]>> => {
		return toLiveStore(
			api.users.watchUsers,
			{ ids },
			{ status: "resolved", data: [] }
		);
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

	login: async ({ creds }) => {
		authkit.signIn()
		return ok();
	},

	logout: async () => {
		await authkit.signOut();
		await client.mutation(api.users.logout, {});
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