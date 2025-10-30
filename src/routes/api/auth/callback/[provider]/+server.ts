import { CONVEX_SITE_URL } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url, cookies, request }) => {
	console.log('=== OAuth Callback START ==='); // TODO:debug EG
	
	const provider = params.provider as string;
	console.log(`[OAuth] Provider: ${provider}`); // TODO:debug EG
	console.log(`[OAuth] Request URL: ${request.url}`); // TODO:debug EG
	console.log(`[OAuth] Query params: ${url.search}`); // TODO:debug EG
	
	// Log incoming cookies
	const incomingCookies = request.headers.get('cookie');
	console.log(`[OAuth] Incoming cookies: ${incomingCookies ? incomingCookies.substring(0, 200) : 'NONE'}`); // TODO:debug EG
	
	const convexCallbackUrl = new URL(`${CONVEX_SITE_URL}/api/auth/callback/${provider}`);
	convexCallbackUrl.search = url.search;
	console.log(`[OAuth] Forwarding to Convex: ${convexCallbackUrl.toString()}`); // TODO:debug EG

	// Build headers with explicit cache-busting
	const forwardHeaders = new Headers(request.headers);
	forwardHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
	forwardHeaders.set('Pragma', 'no-cache');
	forwardHeaders.set('Expires', '0');
	
	console.log('[OAuth] Request headers being sent to Convex:'); // TODO:debug EG
	for (const [key, value] of forwardHeaders.entries()) {
		console.log(`  ${key}: ${value.substring(0, 100)}`); // TODO:debug EG
	}

	const response = await fetch(convexCallbackUrl.toString(), {
		method: 'GET',
		headers: forwardHeaders,
		cache: 'no-store',
	});

	console.log(`[OAuth] Convex response status: ${response.status} ${response.statusText}`); // TODO:debug EG
	console.log(`[OAuth] Convex response content-type: ${response.headers.get('content-type')}`); // TODO:debug EG
	
	// Log all response headers for debugging
	console.log('[OAuth] Convex response headers:'); // TODO:debug EG
	for (const [key, value] of response.headers.entries()) {
		console.log(`  ${key}: ${value}`); // TODO:debug EG
	}

	// Extract and set any cookies from Convex response
	const setCookieHeaders = response.headers.getSetCookie();
	console.log(`[OAuth] Found ${setCookieHeaders.length} Set-Cookie headers from Convex`); // TODO:debug EG
	
	for (const cookieString of setCookieHeaders) {
		console.log(`[OAuth] Processing Set-Cookie: ${cookieString.substring(0, 100)}...`); // TODO:debug EG
		
		const parts = cookieString.split(';');
		const [nameValuePair] = parts.splice(0, 1);
		const [name, value] = nameValuePair.split('=');

		type CookieOptions = {
			path: string;
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: 'strict' | 'lax' | 'none';
			maxAge?: number;
			expires?: Date;
		};

		const cookieOptions: CookieOptions = {
			path: '/',
			httpOnly: false,
			secure: true,
			sameSite: 'lax',
		};

		for (const part of parts) {
			const [key, val] = part.trim().split('=');
			const lowerKey = key.toLowerCase();
			if (lowerKey === 'path') cookieOptions.path = val;
			else if (lowerKey === 'httponly') cookieOptions.httpOnly = true;
			else if (lowerKey === 'secure') cookieOptions.secure = true;
			else if (lowerKey === 'samesite') cookieOptions.sameSite = (val?.toLowerCase() as CookieOptions['sameSite']) || 'lax';
			else if (lowerKey === 'max-age') cookieOptions.maxAge = parseInt(val, 10);
			else if (lowerKey === 'expires') cookieOptions.expires = new Date(val);
		}

		console.log(`[OAuth] Setting cookie "${name}" with options:`, cookieOptions); // TODO:debug EG
		cookies.set(name, decodeURIComponent(value || ''), cookieOptions);
	}

	// If Convex returns HTML (indicating an error or incomplete flow),
	// redirect to home to avoid asset loading issues
	const contentType = response.headers.get('content-type') || '';
	if (response.status === 200 && contentType.includes('text/html')) {
		console.log('[OAuth] WARNING: Convex returned HTML instead of redirect - incomplete OAuth flow'); // TODO:debug EG
		
		// Try to log a preview of the HTML body
		const bodyText = await response.text();
		console.log(`[OAuth] HTML body preview (first 500 chars): ${bodyText.substring(0, 500)}`); // TODO:debug EG
		
		console.log('[OAuth] Redirecting to home with error message'); // TODO:debug EG
		throw redirect(302, '/?message=auth_callback_no_redirect');
	}
	
	// If it's a redirect response, follow it
	if (response.status >= 300 && response.status < 400) {
		const location = response.headers.get('location');
		console.log(`[OAuth] Convex returned redirect to: ${location}`); // TODO:debug EG
		if (location) {
			console.log(`[OAuth] Following redirect with status ${response.status}`); // TODO:debug EG
			throw redirect(response.status as 301 | 302 | 303 | 307 | 308, location);
		}
	}

	// For any other successful response, redirect to home
	if (response.ok) {
		console.log('[OAuth] Convex returned 2xx success, redirecting to home'); // TODO:debug EG
		throw redirect(302, '/');
	}

	// Error case - redirect with error message
	console.log(`[OAuth] ERROR: Convex returned error status ${response.status}`); // TODO:debug EG
	throw redirect(302, `/?message=auth_error_${response.status}`);
};


