<script lang="ts">
	import { onMount } from 'svelte';
	import { tutorials } from '$lib/tutorials/store';

	let active = $state(false);
	let step = $state(0);
	const id = 'home.planner';

	onMount(() => {
		if (!tutorials.isDone('home.welcome')) return;
		if (tutorials.isDone(id)) return;
		active = true;
	});

	function markDone() {
		tutorials.complete(id);
		active = false;
	}
</script>

{#if active}
	{#if step === 1}{/if}
{/if}
