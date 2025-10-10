"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { WorkOS } from "@workos-inc/node";
import { verifyWorkOSAccessToken } from "../lib/workosSession";
import { api, internal } from "../_generated/api";

export const workosSigninCallbackAction = action({
	args: {
		url: v.string(), // full URL including ?code=...
	},
	handler: async (ctx, { url }) => {

		// Read from Convex env (mirrored to process.env in Node actions)
		const workOSApiKey = process.env.WORKOS_API_KEY;
		const workOSClientId = process.env.PUBLIC_WORKOS_CLIENT_ID;
		const cookieName = process.env.SESSION_COOKIE_NAME ?? "wos_session";
		const cookieDomain = process.env.SESSION_COOKIE_DOMAIN;
		const cookieSecure = true //(process.env.SESSION_COOKIE_SECURE ?? "true").toLowerCase() === "true";
		const sameSite = "None" //(process.env.SESSION_COOKIE_SAMESITE ?? "None") as "Lax" | "Strict" | "None";

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

		console.log("[workos] authenticateWithCode result:", JSON.stringify(result));

		const accessToken = result.accessToken;
		if (!accessToken) {
			return {
				status: 500 as const,
				headers: [] as Array<[string, string]>,
				body: "Auth failed: missing access token",
			};
		}

		// Verify token to get the WorkOS user id, then upsert user now
		// so the DB is ready when the app loads.
		const verified = await verifyWorkOSAccessToken(accessToken);
		if (!verified) {
			return {
				status: 401 as const,
				headers: [] as Array<[string, string]>,
				body: "Invalid token",
			};
		}

		const user = result.user;
		console.log("callback user:", JSON.stringify(user, undefined, 2));

		const displayName = user.firstName ?
			user.lastName ? user.firstName + " " + user.lastName : user.firstName
			: "New User";
		await ctx.runMutation(internal.users.upsertCurrentUser, {
			id: verified.userId,
			displayName,
			avatarUrl: user.profilePictureUrl ?? undefined
		});

		const cookie = setCookieHeader(cookieName, accessToken, {
			httpOnly: true,
			secure: true,
			sameSite: "None",
			path: "/",
			// No Domain: host-only for convex.site
		});

		return {
			status: 302 as const,
			headers: [["Set-Cookie", cookie], ["Location", process.env.SITE_URL!]],
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
