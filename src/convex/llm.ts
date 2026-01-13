import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

type Provider = "stub" | "openai" | "groq" | "test";
const ProviderDef = v.union(v.literal("stub"), v.literal("openai"), v.literal("groq"), v.literal("test"));

type CredentialSource = "app" | "user";
const CredentialSourceDef = v.union(v.literal("app"), v.literal("user"));

type LlmCallArgs = {
	message: string;
	provider: Provider;
	model: string;
	credentialSource: CredentialSource;
};

type LlmCallResult = {
	text: string;
	metadata?: {
		provider: Provider;
		model: string;
		credentialSource: CredentialSource;
	};
};

type UserIdentity = { subject: string };
type GetUserByAuthIdRef = typeof internal.users.getUserByAuthId;
type ActionCtxLike = {
	auth: { getUserIdentity: () => Promise<UserIdentity | null> };
	runQuery: (reference: GetUserByAuthIdRef, args: { authId: string }) => Promise<{ settingOverrides?: unknown } | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNestedString(value: unknown, path: Array<string | number>): string | undefined {
	let cur: unknown = value;
	for (const key of path) {
		if (typeof key === "number") {
			if (!Array.isArray(cur)) return undefined;
			cur = cur[key];
			continue;
		}
		if (!isRecord(cur)) return undefined;
		cur = cur[key];
	}
	return typeof cur === "string" ? cur : undefined;
}

export async function callLlmCore(
	ctx: ActionCtxLike,
	args: LlmCallArgs,
	deps: { fetch: typeof fetch; env: Record<string, string | undefined> }
): Promise<LlmCallResult> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ type: "NotAuthorizedError", msg: "No user identity available" });
	}

	if (args.provider === "stub") {
		return {
			text: `stub:${args.model}:${args.message}`,
			metadata: { provider: args.provider, model: args.model, credentialSource: args.credentialSource },
		};
	}

	if (args.provider === "openai") {
		let apiKey: string | undefined;
		if (args.credentialSource === "app") {
			apiKey = deps.env.OPENAI_API_KEY;
			if (!apiKey) {
				throw new ConvexError({
					type: "MissingCredential",
					msg: "Missing app OpenAI API key (OPENAI_API_KEY)",
					ctx: { provider: "openai", credentialSource: args.credentialSource },
				});
			}
		} else {
			const user = await ctx.runQuery(internal.users.getUserByAuthId, { authId: identity.subject });
			apiKey =
				readNestedString(user?.settingOverrides, ["llm", "apiKeys", "openai"]) ??
				readNestedString(user?.settingOverrides, ["llm", "providers", "openai", "apiKey"]);
			if (!apiKey) {
				throw new ConvexError({
					type: "MissingCredential",
					msg: "Missing user OpenAI API key in users.settingOverrides.llm",
					ctx: { provider: "openai", credentialSource: args.credentialSource },
				});
			}
		}

		const text = await callOpenAiCompatibleChatCompletions({
			fetch: deps.fetch,
			baseUrl: "https://api.openai.com/v1",
			providerName: "openai",
			apiKey,
			model: args.model,
			message: args.message,
		});

		return {
			text,
			metadata: { provider: args.provider, model: args.model, credentialSource: args.credentialSource },
		};
	}

	if (args.provider === "groq") {
		let apiKey: string | undefined;
		if (args.credentialSource === "app") {
			apiKey = deps.env.GROQ_API_KEY;
			if (!apiKey) {
				throw new ConvexError({
					type: "MissingCredential",
					msg: "Missing app Groq API key (GROQ_API_KEY)",
					ctx: { provider: "groq", credentialSource: args.credentialSource },
				});
			}
		} else {
			const user = await ctx.runQuery(internal.users.getUserByAuthId, { authId: identity.subject });
			apiKey =
				readNestedString(user?.settingOverrides, ["llm", "apiKeys", "groq"]) ??
				readNestedString(user?.settingOverrides, ["llm", "providers", "groq", "apiKey"]);
			if (!apiKey) {
				throw new ConvexError({
					type: "MissingCredential",
					msg: "Missing user Groq API key in users.settingOverrides.llm",
					ctx: { provider: "groq", credentialSource: args.credentialSource },
				});
			}
		}

		const text = await callOpenAiCompatibleChatCompletions({
			fetch: deps.fetch,
			baseUrl: "https://api.groq.com/openai/v1",
			providerName: "groq",
			apiKey,
			model: args.model,
			message: args.message,
		});

		return {
			text,
			metadata: { provider: args.provider, model: args.model, credentialSource: args.credentialSource },
		};
	}

	/**
	 * Test-only swappable provider for intentionally-run e2e tests.
	 *
	 * - Key comes from env `LLM_API_KEY`
	 * - Endpoint comes from env `LLM_BASE_URL` OR (fallback) `LLM_PROVIDER` ("groq" | "openai")
	 *
	 * This keeps tests provider-agnostic while still verifying a real network call end-to-end.
	 */
	if (args.provider === "test") {
		if (args.credentialSource !== "app") {
			throw new ConvexError({
				type: "InvalidArgumentError",
				msg: "test provider only supports app credentialSource",
				ctx: { provider: "test", credentialSource: args.credentialSource },
			});
		}

		const apiKey = deps.env.LLM_API_KEY;
		if (!apiKey) {
			throw new ConvexError({
				type: "MissingCredential",
				msg: "Missing test API key (LLM_API_KEY)",
				ctx: { provider: "test", credentialSource: args.credentialSource },
			});
		}

		const baseUrl =
			deps.env.LLM_BASE_URL ??
			(deps.env.LLM_PROVIDER === "openai"
				? "https://api.openai.com/v1"
				: deps.env.LLM_PROVIDER === "groq"
					? "https://api.groq.com/openai/v1"
					: "https://api.groq.com/openai/v1");

		const text = await callOpenAiCompatibleChatCompletions({
			fetch: deps.fetch,
			baseUrl,
			providerName: "test",
			apiKey,
			model: args.model,
			message: args.message,
		});

		return {
			text,
			metadata: { provider: args.provider, model: args.model, credentialSource: args.credentialSource },
		};
	}

	throw new ConvexError({
		type: "InvalidArgumentError",
		msg: "Unsupported provider",
		ctx: { provider: args.provider },
	});
}

async function callOpenAiCompatibleChatCompletions(args: {
	fetch: typeof fetch;
	baseUrl: string;
	providerName: "openai" | "groq" | "test";
	apiKey: string;
	model: string;
	message: string;
}) {
	const resp = await args.fetch(`${args.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${args.apiKey}`,
		},
		body: JSON.stringify({
			model: args.model,
			messages: [{ role: "user", content: args.message }],
		}),
	});

	if (!resp.ok) {
		const bodyText = await resp.text().catch(() => "");
		throw new ConvexError({
			type: "ProviderError",
			msg: `${args.providerName} request failed (${resp.status})`,
			ctx: { provider: args.providerName, status: resp.status, bodyText },
		});
	}

	const data: unknown = await resp.json();
	const text =
		readNestedString(data, ["choices", 0, "message", "content"]) ??
		readNestedString(data, ["choices", 0, "delta", "content"]); // defensive

	if (!text) {
		throw new ConvexError({
			type: "ProviderError",
			msg: `${args.providerName} response missing text`,
			ctx: { provider: args.providerName },
		});
	}

	return text;
}

export const call = action({
	args: {
		message: v.string(),
		provider: ProviderDef,
		model: v.string(),
		credentialSource: CredentialSourceDef,
	},
	handler: async (ctx, args: LlmCallArgs): Promise<LlmCallResult> => {
		return await callLlmCore(ctx, args, { fetch, env: process.env });
	},
});

