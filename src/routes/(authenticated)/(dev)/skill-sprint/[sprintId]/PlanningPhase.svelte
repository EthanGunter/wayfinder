<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import LlmChat from '$lib/components/LlmChat.svelte';
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import type { Id } from '$convex/_generated/dataModel';
	import { settings } from '$lib/config/user-settings';
	import { resolveLlm } from '$lib/config/user-settings/llm-options';
	import { planningSystemMessage } from '../agentMessages';
	import { callLlm, extractTags, generateMessageId } from './sprintLogic';
	import type { ChatMessage } from './types';
	import type { SprintState } from '$lib/API/SkillSprints';

	interface Props {
		sprintId: Id<'skillSprints'>;
		sprintState: SprintState;
	}

	let { sprintId, sprintState }: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let assessmentData = $state<Record<string, string>>({});
	let planMarkdown = $state('');
	let isSaving = $state(false);
	let errorMessage = $state<string | null>(null);
	let canConfirm = $state(false);
	let isWaitingForAi = $state(false);

	const llmModel = settings.sprints.core.llmModel;
	const connectionsStore = settings.llm.customConnections.connections;
	const enabledOptionsStore = settings.llm.llm.enabledConnections.getEnabledOptions();

	// Add initial context message with the goal
	$effect(() => {
		if (messages.length === 0) {
			const goal = sprintState.sprint.goal;
			messages = [
				{
					id: generateMessageId(),
					role: 'assistant',
					content: `Let's create a learning plan for your goal: "${goal}"\n\nTo tailor the plan to you, I have a few questions...`
				}
			];
		}
	});

	$effect(() => {
		canConfirm = planMarkdown.trim().length > 0 && !isSaving && !isWaitingForAi;
	});

	async function handleSend(content: string) {
		const userMsg: ChatMessage = {
			id: generateMessageId(),
			role: 'user',
			content
		};
		messages = [...messages, userMsg];

		isWaitingForAi = true;
		errorMessage = null;

		try {
			const resolved = resolveLlm($llmModel, $connectionsStore);
			const responseText = await callLlm({
				systemMessage: planningSystemMessage,
				messages,
				llmConfig: {
					provider: resolved.provider,
					model: resolved.model,
					credentialSource: resolved.credentialSource
				}
			});

			const assistantMsg: ChatMessage = {
				id: generateMessageId(),
				role: 'assistant',
				content: responseText
			};
			messages = [...messages, assistantMsg];

			// Extract structured data from response
			const extracted = extractTags(responseText);
			if (extracted.assessment) {
				assessmentData = extracted.assessment;
			}
			if (extracted.plan) {
				planMarkdown = extracted.plan;
			}
		} catch (error) {
			console.error(error);
			errorMessage = 'AI failed to respond. Check your LLM settings/keys.';
		} finally {
			isWaitingForAi = false;
		}
	}

	async function confirmPlan() {
		const plan = planMarkdown.trim();
		if (!plan || isSaving) return;

		isSaving = true;
		errorMessage = null;

		try {
			// Combine assessment and plan into a single markdown document
			let fullPlanMd = '# Learning Plan\n\n';
			
			if (Object.keys(assessmentData).length > 0) {
				fullPlanMd += '## Assessment\n\n';
				for (const [key, value] of Object.entries(assessmentData)) {
					// Convert camelCase to Title Case
					const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
					fullPlanMd += `**${label}:** ${value}\n\n`;
				}
			}

			fullPlanMd += '## Plan\n\n';
			fullPlanMd += plan;

			await skillSprintsAPI.setPlan({
				sprintId,
				md: fullPlanMd
			});
		} catch (error) {
			console.error(error);
			errorMessage = 'Failed to save plan.';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-5xl p-4">
	<div class="space-y-2">
		<h1 class="text-xl font-semibold">Skill Sprint: Planning Phase</h1>
		<p class="text-sm text-muted-foreground">
			Answer assessment questions and review your personalized learning plan.
		</p>
	</div>

	<div class="mt-6 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
		<section class="flex h-[calc(100vh-12rem)] min-h-[500px] flex-col">
			<LlmChat
				{messages}
				onSend={handleSend}
				disabled={isWaitingForAi}
				selectedModel={$llmModel}
				onModelChange={(v) => ($llmModel = v)}
				modelOptions={$enabledOptionsStore}
				placeholder="Answer the questions or discuss the plan..."
			/>
		</section>

		<aside class="space-y-4">
			{#if Object.keys(assessmentData).length > 0}
				<div class="rounded-md border bg-background p-4">
					<div class="text-sm font-medium">Assessment</div>
					<div class="mt-2 space-y-2 text-sm">
						{#each Object.entries(assessmentData) as [key, value]}
							<div>
								<div class="font-medium text-muted-foreground">
									{key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
								</div>
								<div class="text-foreground">{value}</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="rounded-md border bg-background p-4">
				<div class="text-sm font-medium">Learning Plan</div>
				<div class="mt-2 text-sm text-muted-foreground">
					{#if planMarkdown.trim().length === 0}
						<span>Waiting for a <code class="text-xs">&lt;plan&gt;...&lt;/plan&gt;</code> tag.</span>
					{:else}
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html planMarkdown
								.split('\n')
								.map((line) => {
									if (line.startsWith('###')) {
										return `<h4>${line.replace(/^###\s*/, '')}</h4>`;
									}
									if (line.startsWith('##')) {
										return `<h3>${line.replace(/^##\s*/, '')}</h3>`;
									}
									if (line.startsWith('#')) {
										return `<h2>${line.replace(/^#\s*/, '')}</h2>`;
									}
									if (line.startsWith('- ')) {
										return `<li>${line.replace(/^-\s*/, '')}</li>`;
									}
									if (line.trim() === '') {
										return '<br/>';
									}
									return `<p>${line}</p>`;
								})
								.join('')}
						</div>
					{/if}
				</div>
			</div>

			<Button class="w-full" disabled={!canConfirm} onclick={confirmPlan}>
				{isSaving ? 'Saving plan...' : 'Confirm plan'}
			</Button>

			{#if errorMessage}
				<div class="text-sm text-destructive">{errorMessage}</div>
			{/if}
		</aside>
	</div>
</div>
