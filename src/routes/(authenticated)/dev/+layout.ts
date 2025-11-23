import { devEnabled } from "$lib/user-settings";
import { error, redirect } from "@sveltejs/kit";

export function load() {
	if (!devEnabled) throw error(404, "Not Found");
}