export type LlmProviderId = "stub" | "openai" | "groq";

export type LlmConnection = {
	id: string;
	label: string;
	providerName: string;
	baseUrl: string;
	apiKey: string;
};

import type { EnumOption } from './types';

export const APP_PROVIDER_MODELS: ReadonlyArray<{
	provider: LlmProviderId;
	models: ReadonlyArray<{ id: string; label: string }>;
}> = [
	{ provider: "stub", models: [{ id: "stub", label: "stub" }] },
	{
		provider: "openai",
		models: [
			{ id: "gpt-4o-mini", label: "gpt-4o-mini" },
			{ id: "gpt-4o", label: "gpt-4o" },
		],
	},
	{
		provider: "groq",
		models: [
			{ id: "mixtral-8x7b-32768", label: "mistral" },
			{ id: "llama-3.1-8b-instant", label: "llama 3.1 (8b)" },
		],
	},
];

export function computeDefaultLlmOptions(args: {
	connections: ReadonlyArray<LlmConnection>;
}): Array<EnumOption<string>> {
	const user: Array<EnumOption<string>> = [];
	for (const c of args.connections) {
		const provider = c.providerName?.trim() || "Custom";
		user.push({
			value: `user:${c.id}`,
			label: c.label?.trim() || "(unnamed)",
			subgroup: provider,
		});
	}

	const app: Array<EnumOption<string>> = [];
	for (const { provider, models } of APP_PROVIDER_MODELS) {
		for (const m of models) {
			app.push({
				value: `app:${provider}:${m.id}`,
				label: m.label,
				subgroup: provider,
			});
		}
	}

	return [...user, ...app];
}

/**
 * Filter LLM options to only those that are enabled.
 * Use this throughout the app to get the list of available providers.
 * 
 * @example
 * import { settings } from '$lib/user-settings';
 * import { filterEnabledLlms } from '$lib/user-settings/llm-options';
 * 
 * const enabledLlms = filterEnabledLlms({
 *   allOptions: settings.llmProviders.llm.enabledConnections.options,
 *   enabledIds: $settings.llmProviders.llm.enabledConnections
 * });
 */
export function filterEnabledLlms(args: {
	allOptions: ReadonlyArray<EnumOption<string>>;
	enabledIds: ReadonlyArray<string>;
}): Array<EnumOption<string>> {
	const enabledSet = new Set(args.enabledIds);
	return args.allOptions.filter((opt) => enabledSet.has(opt.value));
}

