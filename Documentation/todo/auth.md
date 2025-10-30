# TODO: Auth System using Convex + BetterAuth Component (SvelteKit, Vercel)

Goal: Implement BetterAuth directly on Convex via the Convex BetterAuth component,
fronted by SvelteKit on Vercel. Support multi-account (Google-style) switching. No refresh tokens in the browser.

Env vars
- Frontend: 
	- Site root address: SITE_URL
- Convex backend:
	- Convex address: CONVEX_URL
	- Convex http endpoint: CONVEX_SITE_URL
- Auth routes exposed under your domain (e.g., https://auth.yourdomain.com or /auth)
	- auth.{SITE_URL}
- OAuth Providers
	- AUTH_{PROVIDER}_CLIENT_ID
	- AUTH_{PROVIDER}_CLIENT_SECRET
- Cookies for account switching
	- SESSION_COOKIE_NAME
	- SESSION_COOKIE_DOMAIN
	- SESSION_COOKIE_SECURE
	- SESSION_COOKIE_SAMESITE

---

## Phase 1: Convex Setup

- Add BetterAuth Convex component:
  - Install packages: @convex-dev/better-auth and better-auth.
  - Register the component in convex.config (app.use(betterAuthComponent)).
  - Create convex/auth.config.ts:
    - Configure BetterAuth providers (e.g., Google OAuth clientId/secret).
    - Set base URLs/domains (provider redirect points to Convex http route).
  - Create convex/auth.ts:
    - Initialize BetterAuth with the Convex adapter from the component.
    - Add plugins:
      - convex() integration plugin
      - sveltekitCookies() last, to propagate Set-Cookie through SvelteKit
    - Export a factory or createAuth() to be used by http router.

- HTTP router:
  - Create convex/http.ts with httpRouter().
  - Register BetterAuth routes: authComponent.registerRoutes(http, createAuth).
  - Export default http.

- Session data model:
  - Rely on BetterAuth storage on Convex (via adapter).
  - Ensure sessions store refresh tokens server-side only; no client exposure.

---

## Phase 2: SvelteKit Integration

- Install BetterAuth Svelte client.
- SvelteKit handle hooks (hooks.server.ts):
  - Use provided svelteKitHandler({ event, resolve, auth, building }):
    - Wire it so /auth/* routes are handled/passed to Convex http routes.
    - Ensure Set-Cookie from Convex passes through to browser.
  - Optionally, load session on each request:
    - auth.api.getSession({ headers: event.request.headers }) and set event.locals.session/user.

- Client session:
  - Initialize BetterAuth client in SvelteKit:
    - Use session store (nanostores) to track auth state reactively.
  - For multi-account UI:
    - Store account metadata (id, name, avatar, org/tenant) in local storage/IDB (no tokens).
    - Never store refresh tokens; BetterAuth handles via httpOnly cookies.

- Routes/Endpoints (client-facing):
  - /auth/login -> triggers BetterAuth sign-in (redirect).
  - /auth/callback -> handled by BetterAuth route via SvelteKit handler (no custom code).
  - /auth/session -> BetterAuth session endpoint (used by client library).
  - /auth/logout -> BetterAuth sign-out per session.
  - Optional alias endpoints maintained by you that forward to BetterAuth.

---

## Phase 3: Cookie and CSRF Strategy

- If same eTLD+1 (auth/app/api under yourdomain.com):
  - Use SameSite=Lax or Strict, HttpOnly, Secure.
  - Origin/Referer checks on POSTs.
  - CSRF token optional but recommended.

- If cross-site (Convex domain differs and no proxy):
  - Use SameSite=None; Secure for BetterAuth session cookies.
  - Implement CSRF:
    - Double-submit CSRF cookie + x-csrf header, or
    - Strict Origin/Referer allowlist on state-changing endpoints.
  - Note third-party cookie restrictions in Safari/Chrome; plan to move to proxy.

---

## Phase 4: Multi-Account Switching

- Per-account sessions:
  - BetterAuth will manage session cookies. You may adopt naming like sid_{accountId}
    if supported by the component, or rely on BetterAuth’s session model.
  - Goal: multiple sessions per user on one browser; UX switch by selecting account.

- Client behavior:
  - Maintain a list of known accounts (metadata only).
  - On selection:
    - Use BetterAuth client to set active session/account context.
    - Fetch short-lived access token/session info from BetterAuth APIs as needed.
  - Keep access tokens only in memory and refresh via BetterAuth when near expiry.

- Server behavior (Convex):
  - For your Convex queries/mutations, extract identity via BetterAuth session
    (auth.api.getSession with headers) and authorize accordingly.
  - Do not call providers directly from Convex except via BetterAuth.

---

## Phase 5: Protected API Calls

- SPA -> Convex:
  - All requests include headers/cookies; BetterAuth session is resolved by Convex via adapter.
  - On each protected action:
    - Validate via BetterAuth session (server-side).
    - Authorize using roles/permissions from session claims.

- Optional: App JWTs
  - If you want local stateless auth across multiple services:
    - Issue short-lived app JWTs inside BetterAuth pipeline or a small wrapper route.
    - Verify JWTs locally in other services.
  - Not required if Convex stays the single backend and BetterAuth session is accessible there.

---

## Phase 6: Providers and Redirects

- Configure providers (Google, GitHub, email/password, etc.) in convex/auth.config.ts.
- Ensure redirect URIs:
  - Point to your SvelteKit-auth path which forwards to Convex BetterAuth routes.
  - Verify provider console configs match these exact URLs.

- Test the sign-in flow:
  - Start auth at /auth/login (SvelteKit/BetterAuth client).
  - Redirect to provider.
  - Return to /auth/callback (handled by BetterAuth via Convex http route through SvelteKit).
  - Confirm cookie set and session available.

---

## Phase 7: Logout and Revocation

- Single-account logout:
  - Call BetterAuth sign-out endpoint.
  - Confirm the session is revoked server-side and cookie cleared.

- Logout all:
  - Use BetterAuth routes to revoke all sessions for the user.
  - On next request, all protected actions fail until re-auth.

- Admin tooling (optional):
  - Mirror session metadata into a Convex table (via BetterAuth hooks/webhooks) for admin UI.
  - Provide “revoke device/session” controls.

---

## Phase 8: Security Hardening

- Refresh token handling:
  - Server-side only in Convex via adapter. Ensure rotation on refresh is persisted.
- Rate limiting:
  - Apply rate limits to auth endpoints (login, refresh).
- Audit logs:
  - Log login successes/failures, session creations, refreshes, revocations.
- Concurrent refresh de-dupe:
  - Ensure BetterAuth component handles concurrent refreshes; if not, add a mutex layer.
- Headers:
  - Enforce Origin/Referer checks on POST/PUT/PATCH/DELETE endpoints.
- CORS:
  - Allow only FRONTEND_ORIGIN to reach your auth/proxy endpoints.

---

## Phase 9: Observability

- Metrics:
  - Log counts of sign-ins, refreshes, revocations, 401s.
- Alerts:
  - Spike in invalid_grant/refresh failures.
  - Unusual auth error rates.

---

## Phase 10: Testing Matrix

- Flows:
  - First login -> session cookie set -> protected call works.
  - Token expiry -> auto refresh via BetterAuth -> protected call works.
  - Multi-account:
    - Add second account -> two sessions in store -> switch accounts -> identity changes.
    - Logout one account -> only that session invalidated; other remains.
  - SSR (if used): event.locals.session populated; hydrating state is consistent.

- Browsers:
  - Chrome, Firefox, Safari (ITP), Edge.
  - Private mode.
  - If cross-site cookies: verify SameSite=None works; check third-party restrictions.

---

## Phase 11: Migration Strategy (if coming from WorkOS)

- Freeze public contract:
  - Keep auth under /auth paths on your domain.
  - SPA never calls WorkOS directly.

- Temporary proxy (if needed):
  - /auth/login, /auth/callback, /auth/session/tokens, /auth/logout proxy to WorkOS now.
  - Swap the proxy to Convex BetterAuth routes later without SPA changes.

- Data migration (optional):
  - If you need to retain sessions, plan a forced re-login window instead.
  - Users table: unify identity keys (emails, external IDs) to BetterAuth model.

---

## Phase 12: Documentation for Devs

- How to add a provider:
  - Update convex/auth.config.ts; set clientId/secret in Convex env; redeploy.
- How to access session server-side:
  - Use auth.api.getSession in Convex functions or SvelteKit handle.
- How to build multi-account UI:
  - Store account metadata locally; switch via BetterAuth client; no tokens persisted.
- How to revoke sessions:
  - Call BetterAuth logout routes; or admin revocation path.

---

## Acceptance Criteria

- No refresh tokens are readable by client JS.
- Multi-account switching works without re-auth flows (if previously signed-in).
- Cookies are httpOnly, Secure, and correct SameSite for deployment.
- Protected Convex actions consistently get session identity via BetterAuth.
- Logout and revoke-all immediately prevent access on subsequent requests.
- Cross-site scenarios include CSRF protections; same-site uses stricter SameSite.