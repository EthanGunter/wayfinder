import { readable, writable } from "svelte/store";
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
				set({ status: "signed-out" });
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
					unsubUser = client.onUpdate(
						api.users.watchUser,
						{ id: userId },
						(user) => {
							console.log('[TODO:debug EG] ConvexAuthProvider onUpdate callback, user:', user); // TODO:debug EG
							if (!user) {
								set({ status: "loading" });
								return;
							}
							console.log('[TODO:debug EG] ConvexAuthProvider calling set with signed-in'); // TODO:debug EG
							set({ status: "signed-in", user: { ...user, createdAt: new Date(user._creationTime) } });
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
		authkit.signOut();

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