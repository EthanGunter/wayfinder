import { httpRouter } from "convex/server";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { readCookieFromHeader, verifyWorkOSAccessToken } from "../lib/workosSession";

const http = httpRouter();

const ALLOWED_ORIGINS = new Set<string>([
	process.env.SITE_URL!,
	"http://localhost:5173", // Dev server
]);

function corsHeadersFor(req?: Request): Headers {
	const origin = req?.headers.get("Origin") || "";
	const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";
	const h = new Headers();
	if (allowOrigin) h.set("Access-Control-Allow-Origin", allowOrigin);
	h.set("Vary", "Origin");
	h.set("Access-Control-Allow-Credentials", "true");
	h.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization, X-Requested-With"
	);
	h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	return h;
}

http.route({
	path: "/auth/whoami",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		return new Response(null, { status: 204, headers: h });
	}),
});

http.route({
	path: "/auth/signout",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		return new Response(null, { status: 204, headers: h });
	}),
});

http.route({
	path: "/auth/session-material",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		return new Response(null, { status: 204, headers: h });
	}),
});

http.route({
	path: "/auth/restore-session",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		return new Response(null, { status: 204, headers: h });
	}),
});

http.route({
	path: "/rpc/users.upsertCurrent",
	method: "OPTIONS",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		return new Response(null, { status: 204, headers: h });
	}),
});

http.route({
	path: "/callback/workos",
	method: "GET",
	handler: httpAction(async (ctx, req) => {
		console.log('WorkOS callback', await req.json());

		const result = await ctx.runAction(
			api.node.workos.workosSigninCallbackAction,
			{ url: req.url }
		);

		const h = corsHeadersFor(req);
		for (const [k, v] of (result.headers as [string, string][])) {
			h.set(k, v);
		}

		console.log("WorkOS callback headers:", JSON.stringify(h, undefined, 2));


		return new Response(result.body, {
			status: result.status,
			headers: h,
		});
	}),
});

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME!;

http.route({
	path: "/auth/whoami",
	method: "GET",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		h.set("Content-Type", "application/json");

		console.log("whoami Req headers:", JSON.stringify(req.headers));
		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);
		if (!token) {
			return new Response(JSON.stringify({ userId: null }), {
				status: 200,
				headers: h,
			});
		}
		const verified = await verifyWorkOSAccessToken(token);
		console.log("whoami verified:", JSON.stringify(verified, undefined, 2));
		return new Response(JSON.stringify({ userId: verified?.userId ?? null }), {
			status: 200,
			headers: h,
		});
	}),
});

http.route({
	path: "/auth/session-material",
	method: "GET",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		h.set("Content-Type", "application/json");

		// Extract the session material (access token) from the cookie
		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);

		if (!token) {
			return new Response(JSON.stringify({ material: null }), {
				status: 200,
				headers: h,
			});
		}

		// Verify it's valid
		const verified = await verifyWorkOSAccessToken(token);
		if (!verified) {
			return new Response(JSON.stringify({ material: null }), {
				status: 200,
				headers: h,
			});
		}

		return new Response(JSON.stringify({ material: token }), {
			status: 200,
			headers: h,
		});
	}),
});

http.route({
	path: "/auth/restore-session",
	method: "POST",
	handler: httpAction(async (_ctx, req) => {
		const h = corsHeadersFor(req);
		h.set("Content-Type", "application/json");

		try {
			const body = await req.json();
			const { material } = body;

			if (!material) {
				return new Response(JSON.stringify({ error: "Missing material" }), {
					status: 400,
					headers: h,
				});
			}

			// Verify the token is still valid
			const verified = await verifyWorkOSAccessToken(material);
			if (!verified) {
				return new Response(JSON.stringify({ error: "Invalid session material" }), {
					status: 401,
					headers: h,
				});
			}

			// Set the session cookie with the restored material
			h.set(
				"Set-Cookie",
				`${SESSION_COOKIE_NAME}=${encodeURIComponent(material)}; Path=/; HttpOnly; Secure; SameSite=None`
			);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: h,
			});
		} catch (e) {
			return new Response(JSON.stringify({ error: "Invalid request" }), {
				status: 400,
				headers: h,
			});
		}
	}),
});

http.route({
	path: "/auth/signout",
	method: "POST",
	handler: httpAction(async (ctx, req) => {
		const h = corsHeadersFor(req);
		h.set("Content-Type", "application/json");

		// Get session ID from access token in cookie
		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);
		let logoutUrl = process.env.SITE_URL || "/";

		if (token) {
			const verified = await verifyWorkOSAccessToken(token);
			if (verified) {
				// Call WorkOS to revoke the session
				const result = await ctx.runAction(api.node.workos.revokeSessionAction, {
					sessionId: verified.sessionId,
				});

				if (result.logoutUrl) {
					logoutUrl = result.logoutUrl;
				}
			}
		}

		// Clear the HttpOnly session cookie by expiring it
		h.set(
			"Set-Cookie",
			`${SESSION_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None`
		);

		return new Response(JSON.stringify({ success: true, logoutUrl }), {
			status: 200,
			headers: h,
		});
	}),
});

http.route({
	path: "/rpc/users.upsertCurrent",
	method: "POST",
	handler: httpAction(async (ctx, req) => {
		const h = corsHeadersFor(req);
		h.set("Content-Type", "application/json");

		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);
		if (!token) return new Response("Unauthorized", { status: 401, headers: h });
		const verified = await verifyWorkOSAccessToken(token);
		if (!verified) return new Response("Unauthorized", { status: 401, headers: h });

		console.log("RPC token:", JSON.stringify(token, undefined, 2));

		const result = await ctx.runMutation(internal.users.upsertCurrentUser, {
			id: verified.userId,
		});

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: h,
		});
	}),
});
export default http;