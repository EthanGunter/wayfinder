import { redirect } from "@sveltejs/kit";

// Redirec to workos auth hosted UI for now
export function load() {
	throw redirect(302, "https://rational-marble-13-staging.authkit.app/");
}