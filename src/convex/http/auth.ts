// convex/http/authTokens.ts
import { httpAction } from "convex/server";
import { sessions } from "../db"; // your table
import { mintAccessTokenWithWorkOS, maybeRotate } from "../workos";

export const post = httpAction(async (ctx, req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const origin = req.headers.get("Origin") || "";
  // optional: enforce allowed origins
  if (!origin.startsWith("https://app.example.com")) return new Response("forbidden", { status: 403 });

  const { accountId } = await req.json();
  if (!accountId) return new Response("accountId required", { status: 400 });

  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)sid_${accountId}=([^;]+)`));
  if (!match) return new Response("no session cookie", { status: 401 });
  const sid = decodeURIComponent(match[1]);

  const session = await ctx.db.get(sessions, sid);
  if (!session || session.revoked) return new Response("invalid session", { status: 401 });

  const rotated = await maybeRotate(session.refreshToken);
  if (rotated?.newRefreshToken) {
    await ctx.db.patch(sessions, sid, { refreshToken: rotated.newRefreshToken });
  }

  const { access_token, expires_in } = await mintAccessTokenWithWorkOS(
    rotated?.newRefreshToken ?? session.refreshToken
  );

  return new Response(JSON.stringify({ access_token, expires_in, token_type: "Bearer" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});