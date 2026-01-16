<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import LlmChat from '$lib/components/LlmChat.svelte';
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import type { Id } from '$convex/_generated/dataModel';
	import { settings } from '$lib/config/user-settings';
	import { resolveLlm } from '$lib/config/user-settings/llm-options';
	import { goalSystemMessage } from '../agentMessages';
	import { callLlm, extractTags, generateMessageId } from './sprintLogic';
	import type { ChatMessage } from './types';
	import type { SprintState } from '$lib/API/SkillSprints';

	interface Props {
		sprintId: Id<'skillSprints'>;
		sprintState: SprintState;
	}

	let { sprintId, sprintState }: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let titleStatement = $state('');
	let goalStatement = $state('');
	let isSaving = $state(false);
	let errorMessage = $state<string | null>(null);
	let canConfirm = $state(false);
	let isWaitingForAi = $state(false);

	const llmModel = settings.sprints.core.llmModel;
	const connectionsStore = settings.llm.customConnections.connections;
	const enabledOptionsStore = settings.llm.llm.enabledConnections.getEnabledOptions();

	// Load existing sprint data
	$effect(() => {
		titleStatement = sprintState.sprint.title;
		goalStatement = sprintState.sprint.goal;
	});

	$effect(() => {
		canConfirm =
			titleStatement.trim().length > 0 &&
			goalStatement.trim().length > 0 &&
			!isSaving &&
			!isWaitingForAi;
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
				systemMessage: goalSystemMessage,
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
			if (extracted.title) {
				titleStatement = extracted.title;
			}
			if (extracted.goal) {
				goalStatement = extracted.goal;
			}
		} catch (error) {
			console.error(error);
			errorMessage = 'AI failed to respond. Check your LLM settings/keys.';
		} finally {
			isWaitingForAi = false;
		}
	}

	async function confirmGoal() {
		const title = titleStatement.trim();
		const goal = goalStatement.trim();
		if (!title || !goal || isSaving) return;

		isSaving = true;
		errorMessage = null;

		try {
			await skillSprintsAPI.updateSprint({
				sprintId,
				title,
				goal
			});
		} catch (error) {
			console.error(error);
			errorMessage = 'Failed to update sprint.';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-5xl p-4">
	<div class="space-y-2">
		<h1 class="text-xl font-semibold">Skill Sprint: Goal Phase</h1>
		<p class="text-sm text-muted-foreground">
			Chat on the left, confirm your goal on the right.
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
				placeholder="Share what you want to get good at."
			/>
		</section>

		<aside class="space-y-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-sm font-medium">Title</div>
				<div class="mt-2 text-sm text-muted-foreground">
					{#if titleStatement.trim().length === 0}
						<span
							>Waiting for a <code class="text-xs">&lt;title&gt;...&lt;/title&gt;</code> tag.</span
						>
					{:else}
						<div class="whitespace-pre-wrap text-foreground">{titleStatement}</div>
					{/if}
				</div>
			</div>

			<div class="rounded-md border bg-background p-4">
				<div class="text-sm font-medium">Goal statement</div>
				<div class="mt-2 text-sm text-muted-foreground">
					{#if goalStatement.trim().length === 0}
						<span>Waiting for a <code class="text-xs">&lt;goal&gt;...&lt;/goal&gt;</code> tag.</span
						>
					{:else}
						<div class="whitespace-pre-wrap text-foreground">{goalStatement}</div>
					{/if}
				</div>
			</div>

			<Button class="w-full" disabled={!canConfirm} onclick={confirmGoal}>
				{isSaving ? 'Updating sprint...' : 'Confirm goal'}
			</Button>

			{#if errorMessage}
				<div class="text-sm text-destructive">{errorMessage}</div>
			{/if}
		</aside>
	</div>
</div>
