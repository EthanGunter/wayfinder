# TODO: Auth System using Convex + BetterAuth Component (SvelteKit, Vercel)

Goal: Implement BetterAuth directly on Convex via the Convex BetterAuth component,
fronted by SvelteKit on Vercel. Support multi-account (Google-style) switching. No refresh tokens in the browser.

Env vars
- Frontend: 
	- Site root address: SITE_URL
- Convex backend:
	- Convex address: CONVEX_URL
	- Convex http endpoint: CONVEX_API
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