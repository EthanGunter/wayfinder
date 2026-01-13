import { describe, test, expect, vi, afterEach } from "vitest";
import { callLlmCore } from "./llm";

describe("LLM provider seam (Convex action)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("stub provider returns deterministic text without network or credentials", async () => {
		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "user1" }) },
			runQuery: async () => null,
		};

		const result = await callLlmCore(
			ctx,
			{ message: "hello", provider: "stub", model: "stub-model", credentialSource: "app" },
			{ fetch, env: {} }
		);

		expect(result.text).toBe("stub:stub-model:hello");
	});

	test("openai provider uses app credential source (env var) and returns provider text", async () => {
		const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
			return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 });
		});
		const fetchMock: typeof fetch = (input, init) => fetchImpl(input, init);

		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "user1" }) },
			runQuery: async () => null,
		};

		const result = await callLlmCore(
			ctx,
			{ message: "ping", provider: "openai", model: "gpt-4o-mini", credentialSource: "app" },
			{ fetch: fetchMock, env: { OPENAI_API_KEY: "app-key" } }
		);

		expect(result.text).toBe("hi");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test("openai provider uses user credential source from users.settingOverrides.llm and returns provider text", async () => {
		const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
		});
		const fetchMock: typeof fetch = (input, init) => fetchImpl(input, init);

		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "user1" }) },
			runQuery: async () => ({ settingOverrides: { llm: { apiKeys: { openai: "user-key" } } } }),
		};

		const result = await callLlmCore(
			ctx,
			{ message: "ping", provider: "openai", model: "gpt-4o-mini", credentialSource: "user" },
			{ fetch: fetchMock, env: {} }
		);

		expect(result.text).toBe("ok");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test("requires auth (even for stub)", async () => {
		const ctx = {
			auth: { getUserIdentity: async () => null },
			runQuery: async () => null,
		};

		await expect(
			callLlmCore(ctx, { message: "x", provider: "stub", model: "m", credentialSource: "app" }, { fetch, env: {} })
		).rejects.toThrow("No user identity");
	});

	test("groq provider uses app credential source (env var) and returns provider text", async () => {
		const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
			return new Response(JSON.stringify({ choices: [{ message: { content: "groq-hi" } }] }), { status: 200 });
		});
		const fetchMock: typeof fetch = (input, init) => fetchImpl(input, init);

		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "user1" }) },
			runQuery: async () => null,
		};

		const result = await callLlmCore(
			ctx,
			{ message: "ping", provider: "groq", model: "llama-3.1-8b-instant", credentialSource: "app" },
			{ fetch: fetchMock, env: { GROQ_API_KEY: "groq-key" } }
		);

		expect(result.text).toBe("groq-hi");
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		const url = fetchImpl.mock.calls[0]?.[0];
		expect(String(url)).toContain("api.groq.com/openai/v1/chat/completions");
	});

	test("test provider uses LLM_API_KEY + LLM_PROVIDER=groq and returns provider text", async () => {
		const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
			return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
		});
		const fetchMock: typeof fetch = (input, init) => fetchImpl(input, init);

		const ctx = {
			auth: { getUserIdentity: async () => ({ subject: "user1" }) },
			runQuery: async () => null,
		};

		const result = await callLlmCore(
			ctx,
			{ message: "ping", provider: "test", model: "llama-3.1-8b-instant", credentialSource: "app" },
			{ fetch: fetchMock, env: { LLM_API_KEY: "k", LLM_PROVIDER: "groq" } }
		);

		expect(result.text).toBe("ok");
		const url = fetchImpl.mock.calls[0]?.[0];
		expect(String(url)).toContain("api.groq.com/openai/v1/chat/completions");
	});
});

