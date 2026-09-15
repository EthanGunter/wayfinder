import { CONVEX_SITE_URL } from '$env/static/private';
import type { RequestHandler } from '@sveltejs/kit';

/* Reroute all /api/ calls to the convex server handler */
export const fallback: RequestHandler = async ({ request, params }) => {
	const path = params.path || '';
	const url = new URL(`/api/${path}`, CONVEX_SITE_URL);
	url.search = new URL(request.url).search;

	try {
		const response = await fetch(url, {
			method: request.method,
			headers: request.headers,
			body: request.method !== 'GET' && request.method !== 'HEAD'
				? await request.text()
				: undefined,
			cache: 'no-store',
		});


		// Create new headers, stripping problematic ones
		const headers = new Headers(response.headers);
		headers.delete('content-encoding');
		headers.delete('content-length');

		// Ensure responses aren't cached by the browser or CDN
		headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		headers.set('Pragma', 'no-cache');

		return new Response(response.body, {
			status: response.status,
			headers: headers,
		});
	} catch (error) {
		console.error('Error in fallback', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};