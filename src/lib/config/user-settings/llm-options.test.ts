import { describe, expect, test } from "vitest";
import { resolveLlm, type LlmConnection } from "./llm-options";

describe("resolveLlm", () => {
	test("resolves app-level stub", () => {
		const res = resolveLlm("app:stub:stub");
		expect(res).toEqual({
			provider: "stub",
			model: "stub",
			credentialSource: "app",
		});
	});

	test("resolves app-level openai model", () => {
		const res = resolveLlm("app:openai:gpt-4o");
		expect(res).toEqual({
			provider: "openai",
			model: "gpt-4o",
			credentialSource: "app",
		});
	});

	test("resolves user-level connection", () => {
		const connections: LlmConnection[] = [
			{ id: "conn1", label: "My Groq", providerName: "Groq", baseUrl: "", apiKey: "" }
		];
		const res = resolveLlm("user:conn1", connections);
		expect(res).toEqual({
			provider: "groq",
			model: "My Groq",
			credentialSource: "user",
		});
	});

	test("falls back to stub on invalid id", () => {
		const res = resolveLlm("invalid:id");
		expect(res.provider).toBe("stub");
	});
});
