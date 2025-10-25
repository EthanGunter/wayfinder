import { describe, it, beforeEach, afterEach } from "vitest";

describe("ConvexAuthProvider — IAuthSessionCapable (unit)", () => {
	beforeEach(() => {
		// TODO: vi.resetModules(); set up BetterAuth multiSession fakes (listDeviceSessions, setActive)
		// TODO: mock ConvexClient.mutation(api.users.ensureCurrentUser)
	});

	afterEach(() => {
		// TODO: vi.clearAllMocks();
	});

	describe("getSessionMaterial", () => {
		it("returns token when matching by user.id or session.userId", () => {
			// - fake listDeviceSessions returns sessions; assert ok(token) on either match
		});

		it("returns ok(null) when no match", () => {
			// - no matching session -> ok(null)
		});

		it("returns err(InvalidStateError) when listing fails", () => {
			// - make listDeviceSessions error -> err(InvalidStateError)
		});
	});

	describe("restoreSession", () => {
		it("activates session and re-ensures user", () => {
			// - setActive called with provided token; ensureCurrentUser mutation invoked
		});
		it("returns err(InputRequiredError) when activation fails", () => {
			// - setActive throws -> err(InputRequiredError)
		});
	});

	describe("getUserSessions", () => {
		it("maps sessions to DTO with optional avatarUrl", () => {
			// - listDeviceSessions returns items -> mapped DTO format
		});
		it("returns err(InvalidStateError) when listing fails", () => {
			// - simulate error
		});
	});

	// TODO: match precedence if user.id and session.userId both present but differ
});





