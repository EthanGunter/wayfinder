<script lang="ts">
	import { onMount } from 'svelte';
	import { tutorials } from '@/tutorials/store';
	import TModal from '@/tutorials/primitives/TModal.svelte';
	import EventHandler from '@/tutorials/primitives/EventHandler.svelte';
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';

	let active = $state(false);
	let step = $state(0);

	const id = 'home.welcome';

	onMount(() => {
		if (tutorials.isDone(id)) return;
		else tutorials.reset(id);
		step = tutorials.getStep(id);
		// TODO:Tutorial only show the tutorial if there are no tasks
		active = true;
	});

	function proceed() {
		tutorials.advance(id);
		step = tutorials.getStep(id);
	}

	function skipAll() {
		// Placeholder: analytics track
		// track('tutorial_skip', { id })
		tutorials.complete('home.welcome');
		tutorials.complete('tasks.example-project');
		tutorials.complete('home.planner');
		active = false;
	}

	function gotoTasksBrowser(e: Event) {
		e.preventDefault();
		e.stopImmediatePropagation();

		tutorials.complete(id);
		active = false;

		goto('/tasks');
	}
</script>

{#if active}
	{#if step === 0}
		<TModal primaryLabel="Thanks for having me!" onPrimary={proceed}>
			{#snippet title()}
				Welcome to Wayfinder alpha!
			{/snippet}
		</TModal>
		<!-- TODO The following belong in the last stage of the planner tutorial -->
		<!-- {:else if step === 1}
		<TModal primaryLabel="Of course!" onPrimary={proceed}
			>This project is still in its infancy 🐣, so be patient with us</TModal
		>
	{:else if step === 2}
		<TModal primaryLabel="Ok" onPrimary={proceed} selector="#btn-feedback" disableTargetInteraction>
			You can report bugs and offer suggestions by clicking the <Icon
				class="inline"
				icon="material-symbols:feedback-outline"
			/> icon
		</TModal> -->
	{:else if step === 1}
		<EventHandler selector="#add-task-button" type="click" onEvent={gotoTasksBrowser} />
		<TModal
			secondaryLabel="skip walkthrough"
			onSecondary={skipAll}
			selector="#add-task-button"
			placement="top"
		>
			Let's create a sample project so I can show you what makes Wayfinder unique!
		</TModal>
	{/if}
{/if}
