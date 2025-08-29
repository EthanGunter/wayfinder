<script lang="ts">
	import { onMount } from 'svelte';
	import { tutorials } from '$lib/tutorials/store';
	import TModal from '@/tutorials/primitives/TModal.svelte';
	import EventHandler from '@/tutorials/primitives/EventHandler.svelte';
	import Icon from '@iconify/svelte';
	import TGate from '@/tutorials/primitives/TGate.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { taskAPIPromise } from '@/stores/services';

	let active = $state(false);
	let step = $state(0);
	let hasSuggestedTasks = $state(false);

	const id = 'home.planner';

	onMount(() => {
		// Must have completed the example project tutorial first
		if (!tutorials.isDone('tasks.example-project')) {
			return;
		}
		if (tutorials.isDone(id)) {
			return;
		}

		// Check if there are suggested tasks to work with
		checkForSuggestedTasks();
	});

	async function checkForSuggestedTasks() {
		// Wait for suggested tasks to actually load with content
		let attempts = 0;
		const maxAttempts = 50; // 5 seconds max wait

		while (attempts < maxAttempts) {
			const suggestedTasksList = document.querySelector('#suggested-tasks-list .tasks-list');

			if (suggestedTasksList && suggestedTasksList.children.length > 0) {
				hasSuggestedTasks = true;
				// tutorials.reset(id);
				step = tutorials.getStep(id);
				active = true;
				return;
			}

			// Wait 100ms before checking again
			await new Promise((resolve) => setTimeout(resolve, 100));
			attempts++;
		}
	}

	function proceed() {
		tutorials.advance(id);
		step = tutorials.getStep(id);
	}

	function skipAll() {
		// Placeholder: analytics track
		// track('tutorial_skip', { id })
		tutorials.complete(id);
		active = false;
	}

	async function waitForTaskInTodaysList() {
		// Move to the gating step and let drop detection advance the tutorial
		proceed();
	}

	async function handleCheckboxClick() {
		proceed();
	}

	function handleTaskDropped(event: Event) {
		const customEvent = event as CustomEvent<any>;
		const detail = customEvent?.detail;
		if (detail?.dropAllowed) {
			proceed();
		}
	}

	async function markDone() {
		const tasks = await taskAPIPromise;
		await tasks.deleteTask({ id: 'gototheball', recursive: true });
		tutorials.complete(id);
		active = false;
		goto('/tasks');
	}
</script>

{#if active && hasSuggestedTasks}
	{#if step === 0}
		<TModal primaryLabel="How?" onPrimary={proceed} selector="#todays-tasks-list">
			{#snippet title()}
				The planner is the most important page in Wayfinder
			{/snippet}
			This is how we help you stay focused on what matters.
		</TModal>
	{:else if step === 1}
		<TModal primaryLabel="Ok" onPrimary={proceed} selector="#suggested-tasks-list" placement="top" disableTargetInteraction>
			{#snippet title()}
				Notice anything missing?
			{/snippet}
			You'll notice "Go to the ball 💃🕺" isn't suggested. That's because you still have things to do
			before you go. Try dragging a task into Today's list
		</TModal>
	{:else if step === 2}
		<EventHandler selector="#todays-tasks-list" type="dnd-drop" once onEvent={handleTaskDropped} />
		<TGate selector=".drop-zones-container" />
	{:else if step === 3}
		<EventHandler
			selector="#suggested-tasks-list .task-list-item span"
			type="dragstart"
			onEvent={waitForTaskInTodaysList}
		/>
		<TModal
			primaryLabel="Nice!"
			onPrimary={proceed}
			selector="#suggested-tasks-list"
			disableTargetInteraction
		>
			{#snippet title()}
				You don't need to see <em>every</em> task you've come up with
			{/snippet}
			Wayfinder only bothers you with actionable next-steps
		</TModal>
	{:else if step === 4}
		<EventHandler
			selector="#todays-tasks-list .task-list-item [role='checkbox']"
			type="click"
			onEvent={handleCheckboxClick}
		/>
		<TModal selector="#todays-tasks-list .task-list-item [role='checkbox']">
			{#snippet title()}
				Mark a task complete
			{/snippet}
			Once you start completing prerequisites, their parents will start to show up. Click the checkbox
			to mark this task complete.
		</TModal>
	{:else if step === 5}
		<TModal primaryLabel="Seems simple!" onPrimary={proceed}>
			{#snippet title()}
				Today's tasks reset at the end of the day
			{/snippet}
			Scientists recommend 3-5 each day
		</TModal>
	{:else if step === 6}
		<TModal
			primaryLabel="Have fun conquering your dreams!"
			onPrimary={markDone}
			onOutsideClick={markDone}
			selector="#btn-feedback"
			placement="bottom"
		>
			{#snippet title()}
				That's the gist of Wayfinder!
			{/snippet}
			Please remember it's still in alpha, so don't hesitate to use that <Icon
				class="inline"
				icon="material-symbols:feedback-outline"
			/> button.
		</TModal>
	{/if}
{/if}
