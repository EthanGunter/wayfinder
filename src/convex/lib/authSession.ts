export const cookieOpts = {
	httpOnly: true,
	secure: true,
	sameSite: "lax" as const, // switch to "none" if cross-site; add CSRF
	path: "/",
	// maxAge aligned with refresh token TTL
};

export function setSessionCookie(res: any, accountId: string, sid: string) {
	res.setHeader(
		"Set-Cookie",
		`sid_${accountId}=${sid}; HttpOnly; Secure; SameSite=${cookieOpts.sameSite}; Path=${cookieOpts.path}; Max-Age=${60 *
		60 * 24 * 90}`
	);
}

export function clearSessionCookie(res: any, accountId: string) {
	res.setHeader(
		"Set-Cookie",
		`sid_${accountId}=; HttpOnly; Secure; SameSite=${cookieOpts.sameSite}; Path=${cookieOpts.path}; Max-Age=0`
	);
}

type Tok = { token: string; exp: number };
const mem = new Map<string, Tok>();

export async function getAccessToken(accountId: string) {
	const now = Math.floor(Date.now() / 1000);
	const cur = mem.get(accountId);
	if (cur && cur.exp - 60 > now) return cur.token;

	const r = await fetch("https://api.example.com/auth/tokens", {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ accountId }),
	});
	if (!r.ok) throw new Error(`token broker ${r.status}`);
	const { access_token, expires_in } = await r.json();
	mem.set(accountId, { token: access_token, exp: now + expires_in });
	return access_token;
}