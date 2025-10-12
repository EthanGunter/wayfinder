"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { WorkOS } from "@workos-inc/node";
import { verifyWorkOSAccessToken } from "../lib/workosSession";
import { api, internal } from "../_generated/api";

/**
 * Handle OAuth callback from WorkOS after user authentication.
 * 
 * OAuth Flow:
 * 1. User clicks "Sign in with Google" (or email/password on WorkOS)
 * 2. WorkOS authenticates the user
 * 3. WorkOS redirects to this endpoint with ?code=...
 * 4. We exchange the code for an access token + user profile
 * 5. Upsert user in Convex DB
 * 6. Set HttpOnly cookie with access token
 * 7. Redirect to SITE_URL (our app)
 * 
 * Data received from WorkOS:
 * - accessToken: JWT access token (10min expiry, contains userId + sessionId)
 * - user: {id, email, firstName, lastName, profilePictureUrl, ...}
 * 
 * Data stored:
 * - Cookie: wos_session={accessToken} (HttpOnly, so JS can't access it)
 * - Convex DB: users table with authId=user.id
 * 
 * After redirect, ConvexAuthProvider.bootstrap() will check /auth/whoami
 * to verify the cookie and subscribe to user data.
 */
export const workosSigninCallbackAction = action({
	args: {
		url: v.string(), // full URL including ?code=...
	},
	handler: async (ctx, { url }) => {

		// Read from Convex env (mirrored to process.env in Node actions)
		const AUTH_API_KEY = process.env.AUTH_API_KEY;
		const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID;
		const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME;
		const SESSION_COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN;
		const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE;
		const SESSION_COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE;

		if (!AUTH_API_KEY) {
			return {
				status: 500 as const,
				headers: [] as Array<[string, string]>,
				body: "Missing AUTH_API_KEY",
			};
		}
		if (!AUTH_CLIENT_ID) {
			return {
				status: 500 as const,
				headers: [] as Array<[string, string]>,
				body: "Missing AUTH_CLIENT_ID",
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

		const workos = new WorkOS(AUTH_API_KEY);

		// Exchange authorization code for access token + user profile
		// This is the core OAuth code-for-token exchange
		const result = await workos.userManagement.authenticateWithCode({
			code,
			clientId: AUTH_CLIENT_ID,
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

		// Verify token to extract WorkOS user ID and session ID
		// This decodes and validates the JWT against WorkOS JWKS
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

		// Upsert user in Convex DB so it's ready when the app loads
		// This ensures the user exists before bootstrap() subscribes to it
		const displayName = user.firstName ?
			user.lastName ? user.firstName + " " + user.lastName : user.firstName
			: "New User";
		await ctx.runMutation(internal.users.upsertCurrentUser, {
			id: verified.userId,
			displayName,
			avatarUrl: user.profilePictureUrl ?? undefined
		});

		// Set HttpOnly cookie with access token
		// This is the session cookie that will be sent with all future requests
		const cookie = setCookieHeader(SESSION_COOKIE_NAME, accessToken, {
			httpOnly: true,  // JS can't access (security)
			secure: true,    // HTTPS only
			sameSite: "None", // Allow cross-site (Convex backend is different domain)
			path: "/",
			// No Domain: host-only for convex.site
		});

		// Redirect back to the app with session cookie set
		return {
			status: 302 as const,
			headers: [["Set-Cookie", cookie], ["Location", process.env.SITE_URL!]],
			body: null,
		};
	},
});


export const revokeSessionAction = action({
	args: {
		sessionId: v.string(),
	},
	handler: async (ctx, { sessionId }) => {
		const workOSApiKey = process.env.WORKOS_API_KEY;

		if (!workOSApiKey) {
			return {
				success: false,
				logoutUrl: null,
			};
		}

		try {
			const workos = new WorkOS(workOSApiKey);

			// Revoke the session on WorkOS side
			await workos.userManagement.revokeSession({ sessionId });

			// Get the logout URL to clear WorkOS browser session
			const logoutUrl = workos.userManagement.getLogoutUrl({ sessionId });

			console.log("[workos] Session revoked, logout URL:", logoutUrl);

			return {
				success: true,
				logoutUrl,
			};
		} catch (e: any) {
			console.error("[workos] Failed to revoke session:", e?.message || e);
			return {
				success: false,
				logoutUrl: null,
			};
		}
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
