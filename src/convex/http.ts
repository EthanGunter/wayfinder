import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { readCookieFromHeader, verifyWorkOSAccessToken } from "./lib/workosSession";

const http = httpRouter();

const ALLOWED_ORIGINS = new Set<string>([
	process.env.SITE_URL!
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

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "wos_session";

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