import { describe, expect, test, vi, beforeEach } from "vitest";
import { writable } from "svelte/store";

function getStatus(e: unknown): number | undefined {
	if (typeof e !== "object" || e === null) return undefined;
	if (!("status" in e)) return undefined;
	const status = (e as { status?: unknown }).status;
	return typeof status === "number" ? status : undefined;
}

describe("/dev route gate", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	test("throws 404 when dev is not enabled", async () => {
		vi.doMock("$lib/user-settings", () => ({ devEnabled: writable(false) }));

		const { load } = await import("./+layout");

		let thrown: unknown;
		try {
			load();
		} catch (e) {
			thrown = e;
		}

		expect(getStatus(thrown)).toBe(404);
	});

	test("does not throw when dev is enabled", async () => {
		vi.doMock("$lib/user-settings", () => ({ devEnabled: writable(true) }));

		const { load } = await import("./+layout");

		expect(() => load()).not.toThrow();
	});
});

