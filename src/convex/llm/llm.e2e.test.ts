import { beforeAll, describe, test, expect } from "vitest";
import { callLlmCore } from "./llm";

const model = process.env.LLM_MODEL ?? "llama-3.1-8b-instant";

describe("LLM seam e2e", () => {
	beforeAll(() => {
		if (!process.env.LLM_API_KEY) {
			throw new Error(
				"Missing LLM_API_KEY for e2e tests. Set it in `.env.test.local`"
			);
		}
	});

	test("test provider returns non-empty text from real provider", async () => {
		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "e2e-user" }) },
			runQuery: async () => null,
		};

		const result = await callLlmCore(
			ctx,
			{
				message: "reply with a single short sentence that includes the word 'wayfinder'",
				provider: "test",
				model,
				credentialSource: "app",
			},
			{ fetch, env: process.env }
		);
		expect(result.text.trim().length).toBeGreaterThan(0);
	});
});

