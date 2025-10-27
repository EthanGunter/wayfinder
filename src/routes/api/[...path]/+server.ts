import { CONVEX_SITE_URL } from '$env/static/private';
import { PUBLIC_SITE_URL } from '$env/static/public';
import type { RequestHandler } from '@sveltejs/kit';

/* Reroute all /api/ calls to the convex server handler */
export const fallback: RequestHandler = async ({ request, params }) => {
	console.log("SITE URL FROM VERCEL:", PUBLIC_SITE_URL);

	const path = params.path || '';
	const url = new URL(`${CONVEX_SITE_URL}/api/${path}`);
	url.search = new URL(request.url).search;

	const response = await fetch(url, {
		method: request.method,
		headers: request.headers,
		body: request.method !== 'GET' && request.method !== 'HEAD'
			? await request.text()
			: undefined,
	});

	// Create new headers, stripping problematic ones
	const headers = new Headers(response.headers);
	headers.delete('content-encoding');
	headers.delete('content-length');

	return new Response(response.body, {
		status: response.status,
		headers: headers, // Use the modified headers
	});
};