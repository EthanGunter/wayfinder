// src/lib/adapters/ConvexAuthProvider.ts
import { readable } from "svelte/store";
import {
	NetworkError,
	type Fetchable,
	type IAuthRemote,
	type LiveStore,
} from "./seam-interfaces";
import type {
	User,
	LoginCredentials,
	RegistrationRequirements,
} from "$domain/models/user";
import {
	type NotImplementedError,
	type ArgumentError,
	type InvalidStateError,
	type NotFoundError,
	UnknownError,
} from "$domain/errors";
import { err, ok, type Result } from "$domain/result";

import { api } from "$convex/_generated/api";
import { ConvexClient } from "convex/browser";
import { PUBLIC_CONVEX_URL } from "$env/static/public";
import type { Doc } from "$convex/_generated/dataModel";
import { authkit } from "$lib/API/WorkOSAuthKit";

const client = new ConvexClient(PUBLIC_CONVEX_URL);

const convexApi: IAuthRemote = {
	watchUser: ({ id }: { id: string }): LiveStore<Fetchable<User>> => {
		return toLiveStore(
			api.users.watchUser,
			{ id },
			{
				status: "error",
				error: {
					type: "NotFoundError",
					message: "User not found",
					ctx: { id },
				} as any,
			},
		);
	},
	watchUsers: ({ ids }: { ids: string[] }): LiveStore<Fetchable<User[]>> => {
		return toLiveStore(
			api.users.watchUsers,
			{ ids },
			{ status: "resolved", data: [] }, // empty list on not-found
		);
	},
	getRegistrationRequirements(_method): Result<RegistrationRequirements[], NotImplementedError> {
		return ok<RegistrationRequirements[]>([]);
	},

	register: async ({ creds, userData }) => {
		console.log("[ConvexAuthProvider] register user");
		await authkit.signIn();
		await client.mutation(api.users.register, { creds, userData });
		return ok();
	},

	updateUser: async ({ update }) => {
		const res = await client.mutation(api.users.updateUser, { update });
		if (res.ok) return ok(res.value);
		return err(res.error);
	},

	deleteUser: async ({ userId }) => {
		const res = await client.mutation(api.users.deleteUser, { userId })
		if (res.ok) return ok();
		return err(res.error);
	},

	login: async ({ creds }) => {
		await authkit.signIn();
		const res = await client.mutation(api.users.login, { creds })
		if (res.ok) return ok();
		return err(res.error);
	},

	logout: async () => {
		await authkit.signOut();
		await client.mutation(api.users.logout, {})
	}
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