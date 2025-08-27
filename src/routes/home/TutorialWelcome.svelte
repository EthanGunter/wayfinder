<script lang="ts">
	import { onMount } from 'svelte';
	import { tutorials } from '$lib/components/tutorials/store';
	import TModal from '$lib/components/tutorials/primitives/TModal.svelte';
	import TGate from '$lib/components/tutorials/primitives/TGate.svelte';
	import EventHandler from '$lib/components/tutorials/primitives/EventHandler.svelte';
	import Icon from '@iconify/svelte';

	let active = $state(false);
	let step = $state(0);

	const id = 'home.welcome';

	onMount(() => {
		if (tutorials.isDone(id)) return;
		else tutorials.reset(id);
		step = tutorials.getStep(id);
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
		tutorials.complete('home.dance-example');
		tutorials.complete('home.todays-tasks');
		active = false;
	}

	function markDone() {
		tutorials.complete(id);
		active = false;
	}
</script>

{#if active}
	{#if step === 0}
		<TModal primaryLabel="Thanks for having me!" onPrimary={proceed}>Welcome to Wayfinder!</TModal>
	{:else if step === 1}
		<TModal primaryLabel="Of course!" onPrimary={proceed}
			>This project is still in its infancy 🐣, so be patient with us</TModal
		>
	{:else if step === 2}
		<TModal primaryLabel="Ok" onPrimary={proceed} selector="#btn-feedback" disableTargetInteraction>
			You can report bugs and offer suggestions by clicking the <Icon
				class="inline"
				icon="material-symbols:feedback-outline"
			/> icon
		</TModal>
	{:else if step === 3}
		<EventHandler selector="#add-task-button" type="click" onEvent={markDone} />
		<TModal
			secondaryLabel="skip walkthrough"
			onSecondary={skipAll}
			selector="#add-task-button"
			placement="top"
			blockPage={false}
		>
			Click "Start a Project" so I can show you what makes Wayfinder unique!
		</TModal>
	{/if}
{/if}
