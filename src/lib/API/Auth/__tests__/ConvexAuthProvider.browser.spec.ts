// Run with vitest/browser environment
import { describe, it } from "vitest";

describe("ConvexAuthProvider — browser events (visibility)", () => {
	it("re-bootstrap on document.visibilitychange to 'visible'", () => {
		// - Use vitest/browser to have document
		// - mock authClient.getSession switching states to verify bootstrap re-runs
		// - dispatch visibilitychange event; assert bootstrap invoked again
	});
});





