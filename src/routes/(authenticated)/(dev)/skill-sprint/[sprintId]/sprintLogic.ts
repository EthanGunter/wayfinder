import { sharedConvexClient } from '$lib/API/ConvexClient';
import { api as convexApi } from '$convex/_generated/api';
import type { ChatMessage, TagExtractionResult } from './types';

type Provider = 'stub' | 'openai' | 'groq' | 'test';
type CredentialSource = 'app' | 'user';

/**
 * Calls the LLM with a formatted transcript and returns the AI response
 */
export async function callLlm(params: {
	systemMessage: string;
	messages: ChatMessage[];
	llmConfig: { provider: Provider; model: string; credentialSource: CredentialSource };
}): Promise<string> {
	const conversationTranscript = params.messages
		.map((m) => `${m.role}: ${m.content}`)
		.join('\n');
	const transcript = `system: ${params.systemMessage}\n\n${conversationTranscript}`;

	const result = await sharedConvexClient.action(convexApi.llm.call, {
		message: transcript,
		provider: params.llmConfig.provider,
		model: params.llmConfig.model,
		credentialSource: params.llmConfig.credentialSource
	});

	return result.text;
}

/**
 * Extracts structured data from LLM response using XML-style tags
 * Supports: <title>, <goal>, <date>, <assessment>, <plan>
 */
export function extractTags(text: string): TagExtractionResult {
	const result: TagExtractionResult = {};

	// Extract title (last occurrence)
	const titlePattern = /<title>([\s\S]*?)<\/title>/g;
	let titleMatch: RegExpExecArray | null = null;
	let lastTitle: string | null = null;
	while ((titleMatch = titlePattern.exec(text)) !== null) {
		lastTitle = titleMatch[1] ?? null;
	}
	if (lastTitle !== null) {
		const trimmed = lastTitle.trim();
		if (trimmed.length > 0) {
			result.title = trimmed;
		}
	}

	// Extract goal (last occurrence)
	const goalPattern = /<goal>([\s\S]*?)<\/goal>/g;
	let goalMatch: RegExpExecArray | null = null;
	let lastGoal: string | null = null;
	while ((goalMatch = goalPattern.exec(text)) !== null) {
		lastGoal = goalMatch[1] ?? null;
	}
	if (lastGoal !== null) {
		const trimmed = lastGoal.trim();
		if (trimmed.length > 0) {
			result.goal = trimmed;
		}
	}

	// Extract date (last occurrence)
	const datePattern = /<date>([\s\S]*?)<\/date>/g;
	let dateMatch: RegExpExecArray | null = null;
	let lastDate: string | null = null;
	while ((dateMatch = datePattern.exec(text)) !== null) {
		lastDate = dateMatch[1] ?? null;
	}
	if (lastDate !== null) {
		const trimmed = lastDate.trim();
		if (trimmed.length > 0) {
			result.date = trimmed;
		}
	}

	// Extract assessment (all key-value pairs within <assessment> block)
	const assessmentPattern = /<assessment>([\s\S]*?)<\/assessment>/g;
	const assessmentMatch = assessmentPattern.exec(text);
	if (assessmentMatch && assessmentMatch[1]) {
		const assessmentBlock = assessmentMatch[1];
		const assessment: Record<string, string> = {};
		
		// Extract key-value pairs like <key>value</key>
		const kvPattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
		let kvMatch: RegExpExecArray | null = null;
		while ((kvMatch = kvPattern.exec(assessmentBlock)) !== null) {
			const key = kvMatch[1]?.trim();
			const value = kvMatch[2]?.trim();
			if (key && value) {
				assessment[key] = value;
			}
		}
		
		if (Object.keys(assessment).length > 0) {
			result.assessment = assessment;
		}
	}

	// Extract plan (last occurrence)
	const planPattern = /<plan>([\s\S]*?)<\/plan>/g;
	let planMatch: RegExpExecArray | null = null;
	let lastPlan: string | null = null;
	while ((planMatch = planPattern.exec(text)) !== null) {
		lastPlan = planMatch[1] ?? null;
	}
	if (lastPlan !== null) {
		const trimmed = lastPlan.trim();
		if (trimmed.length > 0) {
			result.plan = trimmed;
		}
	}

	return result;
}

/**
 * Generates a unique message ID
 */
let messageIdCounter = 0;
export function generateMessageId(): string {
	return `msg-${++messageIdCounter}`;
}
