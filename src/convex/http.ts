import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { readCookieFromHeader, verifyWorkOSAccessToken } from "./lib/workosSession";

const http = httpRouter();

http.route({
	path: "/callback/workos",
	method: "GET",
	handler: httpAction(async (ctx, req) => {
		console.log(req.url);

		const result = await ctx.runAction(
			api.node.workos.workosSigninCallbackAction,
			{ url: req.url }
		);
		console.log(JSON.stringify(result.headers));

		const headers = new Headers();
		for (const [k, v] of result.headers as [string, string][]) headers.append(k, v);

		return new Response(result.body, {
			status: result.status,
			headers,
		});
	}),
});

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "wos_session";

http.route({
	path: "/auth/whoami",
	method: "GET",
	handler: httpAction(async (_ctx, req) => {
		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);
		if (!token) {
			return new Response(JSON.stringify({ userId: null }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		const verified = await verifyWorkOSAccessToken(token);
		return new Response(
			JSON.stringify({ userId: verified?.userId ?? null }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	}),
});

http.route({
	path: "/rpc/users.upsertCurrent",
	method: "POST",
	handler: httpAction(async (ctx, req) => {
		const token = readCookieFromHeader(req, SESSION_COOKIE_NAME);
		if (!token) return new Response("Unauthorized", { status: 401 });
		const verified = await verifyWorkOSAccessToken(token);
		if (!verified) return new Response("Unauthorized", { status: 401 });

		const result = await ctx.runMutation(
			internal.users.upsertCurrentUser,
			{ callerAuthId: verified.userId }
		);

		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}),
});
export default http;