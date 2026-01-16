import { devEnabled } from "$lib/config/user-settings";
import { error } from "@sveltejs/kit";
import { get } from "svelte/store";
import { authState } from "$lib/API/Auth";

// Wait for auth state to resolve (not loading) before checking dev access
async function waitForAuthResolved(): Promise<void> {
	return new Promise((resolve) => {
		const currentState = get(authState);
		if (currentState.status !== "loading") {
			resolve();
			return;
		}

		const unsubscribe = authState.subscribe((state) => {
			if (state.status !== "loading") {
				unsubscribe();
				resolve();
			}
		});
	});
}

export async function load() {
	await waitForAuthResolved();
	if (!get(devEnabled)) throw error(404, "Not Found");
}