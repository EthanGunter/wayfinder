import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "../auth";
import { httpAction } from "../_generated/server";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

export const ping = httpAction(async (ctx, req) => {
	if (req.method !== "GET") {
		return new Response("Method Not Allowed", { status: 405 });
	}
	const url = new URL(req.url);
	return new Response(
		JSON.stringify({
			ok: true,
			method: req.method,
			path: url.pathname,
			query: Object.fromEntries(url.searchParams),
			ts: Date.now(),
		}),
		{
			status: 200,
			headers: {
				"content-type": "application/json",
				"cache-control": "no-store",
			},
		}
	);
});

http.route({
	path: "/api/test",
	method: "GET",
	handler: ping
});



export default http;