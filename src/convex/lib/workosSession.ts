"use node";

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

// Correct JWKS for User Management tokens (NOT /sso/jwks)
const WORKOS_JWKS_URL = "https://api.workos.com/sso/jwks/client_01K72N66HDHSSHQ1VBGM4R24WJ";
const JWKS = createRemoteJWKSet(new URL(WORKOS_JWKS_URL));

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

export async function verifyWorkOSAccessToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    // Verify against WorkOS User Management JWKS (we don't pre-read iss)
    // jose will pick the key via kid; we can optionally enforce issuer
    const { payload } = await jwtVerify(token, JWKS);

    // If you want to enforce issuer after verify, do it here:
    // const iss = payload.iss;
    // if (typeof iss !== "string" || !iss.startsWith("https://api.workos.com/user_management/")) {
    //   return null;
    // }

    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!sub) return null;

    return { userId: sub };
  } catch (e: any) {
    console.error("[workos] jwtVerify error:", e?.message || e);
    return null;
  }
}