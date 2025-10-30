import { describe, it, beforeEach, afterEach } from "vitest";

// NOTE: Module-level bootstrap in the SUT will run on import. We will vi.mock
// dependencies before importing the SUT in implementation. For skeleton, we only
// outline the behaviors and add minimal comments.

describe("ConvexAuthProvider — IAuthRemote (unit)", () => {
	beforeEach(() => {
		// TODO: vi.resetModules(); set up module mocks for BetterAuth, ConvexClient, api, env, page, fetch
	});

	afterEach(() => {
		// TODO: vi.clearAllMocks();
	});

	describe("bootstrap + watchAuthState", () => {
		it("no session => signed-out and Convex auth null", () => {
			// - fake authClient.getSession -> null
			// - import SUT; collect watchAuthState store emissions
			// - assert last state is { status: 'signed-out' }
			// - assert ConvexClient.setAuth() installed and returns null token
		});

		it("session present => installs token fetcher, ensures user, subscribes to user", () => {
			// - fake authClient.getSession -> { data: { user: { id: "u1" } } }
			// - import SUT; verify ConvexClient.setAuth registered
			// - simulate token endpoint responses (200 with {token}, and non-200 => null)
			// - verify ensureCurrentUser mutation invoked once
			// - push a user via onUpdate -> expect authState 'signed-in' with createdAt: Date
		});

		it("visibilitychange visible => re-runs bootstrap (covered in browser spec)", () => {
			// - Node env: skip here; verified in browser-focused spec
		});
	});

	describe("watchUsers", () => {
		it("maps list and converts _creationTime -> createdAt Date", () => {
			// - return array rows with _creationTime
			// - expect 'resolved' data with createdAt Date and no _creationTime
			// - Integration will assert against conversion functions as source of truth
		});

		it("null => resolved [] (contract)", () => {
			// - server returns null -> expect resolved []
		});

		it("error => error(Err)", () => {
			// - onUpdate error callback -> Fetchable<error>
		});
	});

	describe("register", () => {
		it("email/password: calls signUp.email and re-bootstrap", () => {
			// - stub signUp.email; assert called with name/email/password/image
			// - assert bootstrap called again
		});

		it("external: calls signIn.social('github') with callbackURL", () => {
			// - stub signIn.social; assert provider and callbackURL path
		});
	});

	describe("login", () => {
		it("email/password: calls signIn.email then bootstrap", () => {
			// - stub signIn.email; assert called; bootstrap invoked
		});

		it("external: calls signIn.social('github')", () => {
			// - stub signIn.social; assert provider
		});

		it("propagates signIn errors", () => {
			// - make signIn throw; expect the function to throw
		});
	});

	describe("logout", () => {
		it("signs out and sets signed-out even if signOut throws", () => {
			// - stub signOut to throw; expect final state signed-out and Convex auth cleared
		});
	});

	describe("mutations", () => {
		it("updateUser returns ok(value) on { ok: true }", () => {
			// - program mutation result -> { ok: true, value: user }
		});
		it("updateUser returns err(error) on { ok: false }", () => {
			// - program mutation result -> { ok: false, error }
		});
		it("deleteUser returns ok() on { ok: true } else err(error)", () => {
			// - program mutation result both ways
		});
	});

	describe("server stream semantics", () => {
		it("user=null => error per spec (TODO: current code sets loading)", () => {
			// - push null through watchUser -> expect error state; mark todo due to mismatch
		});
		it("user=undefined => signed-out per spec (TODO: verify)", () => {
			// - push undefined -> expect signed-out; may require SUT change
		});
	});
});





