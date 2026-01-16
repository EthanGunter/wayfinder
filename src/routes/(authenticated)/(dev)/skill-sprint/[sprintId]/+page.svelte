<script lang="ts">
	import { page } from '$app/stores';
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import type { Id } from '$convex/_generated/dataModel';
	import Icon from '@iconify/svelte';
	import GoalPhase from './GoalPhase.svelte';
	import PlanningPhase from './PlanningPhase.svelte';
	import DailyPhase from './DailyPhase.svelte';

	const sprintId = $derived($page.params.sprintId as Id<'skillSprints'>);
	const sprintState = $derived.by(() => skillSprintsAPI.getSprintState(sprintId));

	// Determine current phase based on sprint data
	const currentPhase = $derived.by(() => {
		if ($sprintState.status !== 'resolved') return null;

		const { sprint, plan } = $sprintState.value;

		// Goal phase: no meaningful goal set yet
		if (!sprint.goal || sprint.goal.trim() === '') {
			return 'goal';
		}

		// Planning phase: goal set but no plan
		if (!plan) {
			return 'planning';
		}

		// Daily phase: plan exists (future implementation)
		return 'daily';
	});
</script>

{#if $sprintState.status === 'resolved'}
	{#if currentPhase === 'goal'}
		<GoalPhase {sprintId} sprintState={$sprintState.value} />
	{:else if currentPhase === 'planning'}
		<PlanningPhase {sprintId} sprintState={$sprintState.value} />
	{:else if currentPhase === 'daily'}
		<DailyPhase {sprintId} sprintState={$sprintState.value} />
	{/if}
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
