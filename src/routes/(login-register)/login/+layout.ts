import { authAPI } from "$lib/API/Auth";
import { redirect } from "@sveltejs/kit";

// Redirect to workos auth hosted UI for now
/* export async function load() {
	await authAPI.login({ type: "external" });
	throw redirect(302, "https://rational-marble-13-staging.authkit.app/");
} */