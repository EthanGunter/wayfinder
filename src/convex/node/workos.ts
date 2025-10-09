"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { WorkOS } from "@workos-inc/node";

export const workosSigninCallbackAction = action({
	args: {
		url: v.string(), // full URL including ?code=...
	},
	handler: async (_ctx, { url }) => {
		console.log("workosSigninCallbackAction");

		// Read from Convex env (mirrored to process.env in Node actions)
		const workOSApiKey = process.env.WORKOS_API_KEY;
		const workOSClientId = process.env.PUBLIC_WORKOS_CLIENT_ID;
		const cookieName = process.env.SESSION_COOKIE_NAME ?? "wos_session";
		const SESSION_COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN;
		const securedSeshCookie =
			(process.env.SESSION_COOKIE_SECURE ?? "true").toLowerCase() === "true";
		const SESSION_COOKIE_SAMESITE = (process.env.SESSION_COOKIE_SAMESITE ??
			"Lax") as "Lax" | "Strict" | "None";

		if (!workOSApiKey) {
			return {
				status: 500 as const,
				headers: [] as Array<[string, string]>,
				body: "Missing WORKOS_API_KEY",
			};
		}
		if (!workOSClientId) {
			return {
				status: 500 as const,
				headers: [] as Array<[string, string]>,
				body: "Missing WORKOS_CLIENT_ID",
			};
		}

		const u = new URL(url);
		const code = u.searchParams.get("code");
		if (!code) {
			return {
				status: 400 as const,
				headers: [] as Array<[string, string]>,
				body: "Missing code",
			};
		}

		const workos = new WorkOS(workOSApiKey);

		const result = await workos.userManagement.authenticateWithCode({
			code,
			clientId: workOSClientId,
		});

	const cookie = setCookieHeader(cookieName, result.accessToken, {
		domain: SESSION_COOKIE_DOMAIN || undefined,
		httpOnly: true,
		secure: securedSeshCookie,
		sameSite: SESSION_COOKIE_SAMESITE,
	});

		return {
			status: 302 as const,
			headers: [
				["Set-Cookie", cookie],
				["Location", process.env.SITE_URL],
			],
			body: null,
		};
	},
});


function setCookieHeader(
	name: string,
	value: string,
	opts: {
		domain?: string;
		path?: string;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "Lax" | "Strict" | "None";
		maxAgeSeconds?: number;
	} = {}
) {
	const parts = [`${name}=${encodeURIComponent(value)}`];
	parts.push(`Path=${opts.path ?? "/"}`);
	if (opts.domain) parts.push(`Domain=${opts.domain}`);
	if (opts.httpOnly !== false) parts.push("HttpOnly");
	if (opts.secure) parts.push("Secure");
	if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
	if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
	return parts.join("; ");
}
