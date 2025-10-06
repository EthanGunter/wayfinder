import { error, redirect } from "@sveltejs/kit";

export function load() {
	if (!import.meta.env.DEV) throw error(404, "Not Found");
}