<script lang="ts">
	import type { Id } from '$convex/_generated/dataModel';
	import type { SprintState } from '$lib/API/SkillSprints';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { settings } from '$lib/config/user-settings';
	import { resolveLlm } from '$lib/config/user-settings/llm-options';
	import { shouldAutoGenerateLesson, generateLesson } from './sprintLogic';
	import LessonView from './LessonView.svelte';

	interface Props {
		sprintId: Id<'skillSprints'>;
		sprintState: SprintState;
	}

	let { sprintId, sprintState }: Props = $props();

	let isGenerating = $state(false);
	let generationError = $state<string | undefined>(undefined);

	const llmModel = settings.sprints.core.llmModel;
	const connectionsStore = settings.llm.customConnections.connections;

	// Get the most recent lesson (sorted by dateCreated, descending)
	let currentLesson = $derived.by(() => {
		if (sprintState.dailyChallenges.length === 0) return undefined;
		const sorted = [...sprintState.dailyChallenges].sort((a, b) => b.dateCreated - a.dateCreated);
		return sorted[0];
	});

	onMount(() => {
		autoGenerateLessonIfNeeded();
	});

	async function autoGenerateLessonIfNeeded() {
		if (shouldAutoGenerateLesson(sprintState.dailyChallenges)) {
			await triggerGeneration();
		}
	}

	async function triggerGeneration() {
		if (isGenerating) return;
		
		isGenerating = true;
		generationError = undefined;

		try {
			const resolved = resolveLlm($llmModel, $connectionsStore);
			await generateLesson(sprintId, {
				provider: resolved.provider,
				model: resolved.model,
				credentialSource: resolved.credentialSource
			});
		} catch (error) {
			console.error('Failed to generate lesson:', error);
			generationError = error instanceof Error ? error.message : 'Failed to generate lesson';
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-5xl p-4">
	{#if isGenerating}
		<div class="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
			<Icon icon="lucide:loader-circle" class="h-12 w-12 animate-spin" />
			<p class="text-lg font-medium">Generating lesson...</p>
		</div>
	{:else if generationError}
		<div class="flex flex-col items-center justify-center gap-4 py-12 text-destructive">
			<Icon icon="lucide:alert-circle" class="h-12 w-12" />
			<p class="text-lg font-medium">Generation failed</p>
			<p class="text-sm">{generationError}</p>
		</div>
	{:else if currentLesson}
		<LessonView lesson={currentLesson} />
	{:else}
		<div class="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
			<Icon icon="lucide:book-open" class="h-12 w-12" />
			<p class="text-lg font-medium">No lessons yet</p>
			<p class="text-sm text-muted-foreground/80">
				Lessons will appear here once generated.
			</p>
		</div>
	{/if}
</div>
