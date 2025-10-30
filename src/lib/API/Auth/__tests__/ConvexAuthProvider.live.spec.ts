import { describe, it, beforeAll, afterAll } from "vitest";

// Contract tests against live Convex dev server.
// Gated by process.env.PUBLIC_CONVEX_URL and process.env.CONVEX_SITE_URL; otherwise skipped.
(process.env.PUBLIC_CONVEX_URL ? describe : describe.skip)("ConvexAuthProvider — live contract", () => {
	beforeAll(() => {
		// - Provide PUBLIC_SITE_URL mock for convex token endpoint if needed
		// - Do NOT mock ConvexClient; let it use PUBLIC_CONVEX_URL (mapped from env)
		// - TODO: import row->user conversion functions and assert mapping matches source of truth
	});

	afterAll(() => {
		// cleanup if needed
	});

	it("ensures current user on session bootstrap", () => {
		// - start with a real BetterAuth session (pre-seeded or via email/password if available)
		// - assert ensureCurrentUser mutation succeeds
		// - TODO: coordinate test credentials or seed flow
	});

	it("watchUsers returns mapped users consistent with conversion functions", () => {
		// - query several users; compare SUT mapping to conversion function outputs
	});

	it("logout clears convex auth (subsequent mutation unauthorized)", () => {
		// - sign out; assert mutation fails or auth token returns null
	});
});





