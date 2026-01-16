<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/button/button.svelte';
	import LlmChat from '$lib/components/LlmChat.svelte';
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import type { Id } from '$convex/_generated/dataModel';
	import { api as convexApi } from '$convex/_generated/api';
	import { sharedConvexClient } from '$lib/API/ConvexClient';
	import { settings } from '$lib/config/user-settings';
	import { resolveLlm } from '$lib/config/user-settings/llm-options';
	import { goalSystemMessage } from '../agentMessages';
	import Icon from '@iconify/svelte';

	type ChatMessage = {
		id: string;
		role: 'user' | 'assistant';
		content: string;
	};

	const sprintId = $derived($page.params.sprintId as Id<'skillSprints'>);
	const sprintState = skillSprintsAPI.getSprintState(sprintId);

	let messages = $state<ChatMessage[]>([]);
	let titleStatement = $state('');
	let goalStatement = $state('');
	let isSaving = $state(false);
	let errorMessage = $state<string | null>(null);
	let messageCounter = 0;
	let canConfirm = $state(false);
	let isWaitingForAi = $state(false);

	const llmModel = settings.sprints.core.llmModel;
	const connectionsStore = settings.llm.customConnections.connections;
	const enabledOptionsStore = settings.llm.llm.enabledConnections.getEnabledOptions();

	// Load existing sprint data
	$effect(() => {
		if ($sprintState.status === 'resolved') {
			const sprint = $sprintState.value.sprint;
			titleStatement = sprint.title;
			goalStatement = sprint.goal;
		}
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
			id: `msg-${++messageCounter}`,
			role: 'user',
			content
		};
		messages = [...messages, userMsg];

		isWaitingForAi = true;
		errorMessage = null;

		try {
			const conversationTranscript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
			const transcript = `system: ${goalSystemMessage}\n\n${conversationTranscript}`;
			const resolved = resolveLlm($llmModel, $connectionsStore);

			const result = await sharedConvexClient.action(convexApi.llm.call, {
				message: transcript,
				...resolved
			});

			const assistantMsg: ChatMessage = {
				id: `msg-${++messageCounter}`,
				role: 'assistant',
				content: result.text
			};
			messages = [...messages, assistantMsg];

			// Parse for title (extract last <title>...</title> tag)
			const titlePattern = /<title>([\s\S]*?)<\/title>/g;
			let titleMatch: RegExpExecArray | null = null;
			let lastTitle: string | null = null;
			while ((titleMatch = titlePattern.exec(result.text)) !== null) {
				lastTitle = titleMatch[1] ?? null;
			}
			if (lastTitle !== null) {
				const trimmed = lastTitle.trim();
				if (trimmed.length > 0) {
					titleStatement = trimmed;
				}
			}

			// Parse for goal statement (extract last <goal>...</goal> tag)
			const goalPattern = /<goal>([\s\S]*?)<\/goal>/g;
			let goalMatch: RegExpExecArray | null = null;
			let lastGoal: string | null = null;
			while ((goalMatch = goalPattern.exec(result.text)) !== null) {
				lastGoal = goalMatch[1] ?? null;
			}
			if (lastGoal !== null) {
				const trimmed = lastGoal.trim();
				if (trimmed.length > 0) {
					goalStatement = trimmed;
				}
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
			// Update the existing sprint with the confirmed title and goal
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

{#if $sprintState.status === 'resolved'}
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
{:else if $sprintState.status === 'loading'}
	<div class="flex flex-1 items-center justify-center py-12 text-muted-foreground">
		<Icon icon="lucide:loader-circle" class="h-6 w-6 animate-spin" />
	</div>
{:else if $sprintState.status === 'error'}
	<div class="flex flex-1 items-center justify-center gap-2 py-12 text-destructive">
		<Icon icon="lucide:alert-circle" class="h-5 w-5" />
		<span>Failed to load sprint.</span>
	</div>
{/if}
