"use node";

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

const WORKOS_JWKS_URL = "https://api.workos.com/sso/jwks";
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

export async function verifyWorkOSAccessToken(token: string): Promise<{
  userId: string;
} | null> {
  try {
    const { payload }: { payload: JWTPayload } = await jwtVerify(token, JWKS, {
      issuer: "https://api.workos.com/",
    });
    const userId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}