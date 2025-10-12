# Auth System Build Plan (WorkOS + Convex + Multi-Account Sessions)

Goal: Implement secure multi-account login (Google-style account switching) using
WorkOS for auth and Convex as the backend. Refresh tokens are backend-only.
Client stores only account metadata and short-lived access tokens in memory.
Server issues application JWTs and validates them locally.

Environment Variabls:
- Frontend SPA: SITE_URL
- Convex backend: CONVEX_URL / CONVEX_API
- WorkOS
	- JWKS: AUTH_JWKS_URL
	- api key: AUTH_API_KEY
	- client ID: AUTH_CLIENT_ID

---

## Phase 1: Domain and Infra Decisions

- Identify secrets storage and key management
	- Server signing key for app JWT (Ed25519 or HS256) in KMS/secret manager
	- Database encryption at rest for refresh tokens

- Define environment variables
  	- FRONTEND_ORIGIN, API_ORIGIN

---

## Phase 2: Data Model (Convex)

- Create `users` collection
	- id, primary email, profile fields

- Create `sessions` collection (per device/session)
	- sid: opaque random (cookie value)
	- userId: ref users
	- accountId: equals userId or tenant-specific account identifier
	- provider: "workos"
	- providerSessionId: WorkOS session ID (for correlation / sign-out)
	- refreshToken: string (rotated on refresh)
	- providerAccessExp?: number (optional cache of provider JWT exp)
	- createdAt, lastUsedAt
	- revoked: boolean
	- device metadata (ua, ip hash, name) optional

- Create `revocations` (optional optimization)
  	- sid or jti list for fast revocation checks (e.g., bloom filter, LRU)

---

## Phase 3: Cookie Strategy

- Naming: one cookie per account/session
	- Name: sid_{accountId}
	- Value: opaque random string; not the refresh token

- Attributes:
	- HttpOnly; Secure
	- SameSite:
- Path=/, Domain=API domain
	- Max-Age aligned to refresh token TTL (e.g., 90 days)

- Operations:
	- On login: Set sid_{accountId}=sid
	- On logout (per account): Clear sid_{accountId}
	- On revoke-all: Clear all sid_* cookies present; mark all sessions revoked

---

## Phase 4: WorkOS Integration

- Configure OAuth/AuthKit:
	- Redirect/callback endpoint on Convex/API domain
	- Scopes: obtain access token + refresh token

- Callback flow:
	- Receive WorkOS session_id, access_token, refresh_token, id_token claims, user info
	- Create/update `users` record
	- Create `sessions` row with new sid and refreshToken
	- Set cookie sid_{accountId}
	- Return minimal account metadata to frontend (id, name, avatar)

- Refresh endpoint integration:
	- Use “authenticate with refresh token” to rotate and mint new provider access token
	- Replace `refreshToken` when rotated
	- Handle invalid_grant to revoke session

---

## Phase 5: Token Broker Endpoints (API)

- POST /auth/tokens
	- Input: { accountId }
	- Auth: Cookie sid_{accountId}; CSRF protections if cross-site
	- Logic:
	- Read sid from matching cookie
	- Load session; reject if revoked/missing
	- If cached provider access not expiring soon, reuse; else refresh via WorkOS
	- If refresh fails: mark revoked, clear cookie, return 401
	- Issue App JWT (your domain) with short exp (5–15 min) and claims:
		- sub=userId, aid=accountId, sid, iat, exp, roles/scopes
	- Return { access_token: appJwt, expires_in }

- POST /auth/logout
	- Input: { accountId }
	- Auth: cookie
	- Logic: mark session revoked, clear sid_{accountId} cookie

- POST /auth/logout_all (optional)
	- Input: { userId or accountId }
	- Auth: server/admin
	- Logic: revoke all sessions; clear all relevant cookies on subsequent responses

- GET /auth/me (optional debugging)
	- Returns server-evaluated identity from provided JWT (if any)

---

## Phase 6: App JWTs (Your Server Tokens)

- Decide signing algorithm
	- EdDSA (Ed25519) recommended; publish JWKS if you have multiple services
	- Or HS256 with strong secret if single service

- Claims and validation rules
	- Required: sub, aid, sid, exp, iat
	- Optional: org_id, role, permissions (from WorkOS claims at login time)
	- Expiration: 5–15 minutes
	- Clock skew tolerance: small (<= 60s)

- Validation path on all API routes (except auth endpoints)
	- Extract Bearer
	- Verify signature and exp
	- Optional: check sid not revoked (sessions.revoked false)
	- Authorize based on role/permissions as needed

---

## Phase 7: Frontend Behavior

- Account metadata cache (IDB/localStorage)
	- Store: accountId, user display name, avatar, org/tenant label
	- Do not store: access tokens, refresh tokens

- In-memory token cache
	- Map accountId -> { token, exp }
	- Refresh 60s before expiry by calling /auth/tokens with credentials: include

- Account switch UX
	- Show list from metadata cache
	- On select:
	- If in-memory token valid: use it
	- Else: call /auth/tokens { accountId }, store in memory, proceed

- On 401 from broker:
	- Remove account from visible list or trigger WorkOS re-auth for that account
	- Clear any in-memory token entry

- CSRF header (if cross-site):
	- Maintain double-submit CSRF token cookie + header
	- Send header on POST/PUT/PATCH/DELETE

---

## Phase 8: CSRF and Browser Privacy

- If API is same-site (recommended):
	- Use SameSite=Lax/Strict cookies
	- Enforce Origin/Referer checks
	- CSRF token optional but recommended

- If API is cross-site:
	- Cookies must be SameSite=None; Secure
	- Implement:
	- Double-submit CSRF cookies + header
	- Strict Origin allowlist for state-changing routes
	- Monitor third-party cookie deprecations (Safari/Chrome). Plan migration to same-site proxy.

---

## Phase 9: Revocation and Sync With WorkOS

- Primary revocation signal:
	- Short-lived App JWTs; detect at next refresh if WorkOS session invalid
	- On invalid_grant: mark session revoked, clear cookie, 401

- Optional proactive revocation:
	- Subscribe to WorkOS webhooks (session revoked, user disabled, org changes)
	- On webhook: find sessions by providerSessionId/userId; mark revoked
	- Next client request: server rejects and clears cookies

- Admin “log out everywhere”:
	- Command to set revoked=true for all user/account sessions
	- Optional cache/bloom of revoked sids to invalidate mid-JWT

---

## Phase 10: Security Hardening

- Store refresh tokens only server-side; encrypt at rest
- Rotate refresh tokens upon each refresh; atomic update
- Debounce concurrent refresh per sid (prevent race/overwrite)
- Rate-limit auth endpoints per IP/sid/user
- Audit logs:
	- Login success/failure, refresh events, revocations, logout actions
- Device/session management UI (optional)
	- List active sessions, device names, last used, revoke button

---

## Phase 11: Testing Matrix

- Functional:
	- First login creates user, session, cookie
	- Obtain app token; access protected route succeeds
	- Token expiry triggers refresh path; continues seamlessly
	- Multi-account: two cookies set; switch account returns correct identity
	- Logout single account removes only that cookie; other account remains
	- Logout all revokes all sessions; all fail

- Failure paths:
	- Corrupted/missing cookie -> 401
	- Invalid_grant at refresh -> revoke session -> 401
	- CSRF missing/invalid (if cross-site) -> 403
	- Origin check failure -> 403

- Browser coverage:
	- Chrome, Firefox, Safari (ITP), Edge
	- Third-party cookie behavior (if cross-site)
	- Private/Incognito modes

---

## Phase 12: Observability and Ops

- Metrics:
	- Token refresh success/fail counts
	- Session count per user/device
	- Latency for /auth/tokens
- Alerts:
	- Spike in invalid_grant
	- Excessive refresh attempts per sid
- Rotation/Key ops:
	- App JWT key rotation process and JWKS rollover (if asymmetric)
	- Secret rotation cadence for WorkOS API key

---

## Phase 13: Documentation for Devs

- How to:
	- Add new auth provider config in WorkOS
	- Handle login redirect and callback
	- Use /auth/tokens on the client for any account
	- Validate app JWT in backend routes
	- Revoke sessions and clear cookies
	- Respond to 401/403 in the frontend

---

## Phase 14: Future: Swap WorkOS for BetterAuth (Optional)

- Keep the same session and cookie model
- Replace “refresh with WorkOS” with BetterAuth’s refresh endpoint
- Reuse token broker API outputs (app JWT unchanged)
- Re-map providerSessionId semantics and webhooks

---

## Acceptance Criteria

- No refresh tokens ever accessible to frontend JS
- Multi-account switching works instantly without re-auth
- All protected endpoints validate locally via app JWT
- Revoked WorkOS sessions cause failure at/before next refresh
- CSRF protections appropriate to cookie site context
- Cookies marked HttpOnly, Secure, and correct SameSite for deployment