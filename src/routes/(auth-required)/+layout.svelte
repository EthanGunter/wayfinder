<script lang="ts">
	import { invalidate } from '$app/navigation';
	import authProvider from '$lib/API/Auth';
	import { onDestroy, onMount } from 'svelte';

	let unsubscribe: Function;

	onMount(() => {
		unsubscribe = authProvider.onAuthStateChanged(() => {
			// Forces the load function of ./+layout.ts to reload the user with updated state
			invalidate('');
		});
	});
	onDestroy(() => {
		if (unsubscribe) unsubscribe();
	});
</script>

<slot />
