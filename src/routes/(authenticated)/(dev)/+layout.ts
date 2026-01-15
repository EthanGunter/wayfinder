import { devEnabled } from "$lib/config/user-settings";
import { error } from "@sveltejs/kit";
import { get } from "svelte/store";

export function load() {
	if (!get(devEnabled)) throw error(404, "Not Found");
}