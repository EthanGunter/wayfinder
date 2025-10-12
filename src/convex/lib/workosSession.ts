"use node";

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// Correct JWKS for User Management tokens (NOT /sso/jwks)
const JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL!));

export function readCookieFromHeader(req: Request, name: string): string | null {
  const cookie = req.headers.get("Cookie");

  if (!cookie) return null;
  const parts = cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq);
    if (k === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

export function parseSessionCookie(cookieValue: string): { accessToken: string; refreshToken: string } | null {
  try {
    const parsed = JSON.parse(cookieValue);
    if (parsed.accessToken && parsed.refreshToken) {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    }
    return null;
  } catch {
    // Might be old format (just access token) - treat as invalid
    return null;
  }
}

/**
 * Verify a WorkOS JWT access token and extract user/session IDs.
 * 
 * JWT Structure:
 * - Header: {kid: "...", alg: "RS256", ...}
 * - Payload: {sub: "user_01...", sid: "session_01...", exp: timestamp, ...}
 * - Signature: Verified against WorkOS JWKS (public keys)
 * 
 * Verification:
 * 1. Fetch public key from WorkOS JWKS endpoint (cached by jose)
 * 2. Verify signature using RS256
 * 3. Check expiration (exp claim)
 * 4. Extract sub (user ID) and sid (session ID)
 * 
 * Returns {userId, sessionId} if valid, null if invalid/expired.
 */
export async function verifyWorkOSAccessToken(
  token: string
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    // Verify against WorkOS User Management JWKS (public keys)
    // jose will automatically:
    // - Select the right key via kid (key ID) in JWT header
    // - Verify the signature matches the payload
    // - Check the token hasn't expired (exp claim)
    const { payload } = await jwtVerify(token, JWKS);

    // If you want to enforce issuer after verify, do it here:
    // const iss = payload.iss;
    // if (typeof iss !== "string" || !iss.startsWith("https://api.workos.com/user_management/")) {
    //   return null;
    // }

    // Extract user ID and session ID from payload
    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    const sid = typeof payload.sid === "string" ? payload.sid : undefined;
    if (!sub || !sid) return null;

    return { userId: sub, sessionId: sid };
  } catch (e: any) {
    console.error("[workos] jwtVerify error:", e?.message || e);
    return null;
  }
}

export async function getSessionFromCookie(req: Request, cookieName: string): Promise<{ accessToken: string; refreshToken: string; userId: string; sessionId: string } | null> {
  const cookieValue = readCookieFromHeader(req, cookieName);
  if (!cookieValue) return null;
  
  const parsed = parseSessionCookie(cookieValue);
  if (!parsed) return null;
  
  const verified = await verifyWorkOSAccessToken(parsed.accessToken);
  if (!verified) return null;
  
  return { ...parsed, ...verified };
}