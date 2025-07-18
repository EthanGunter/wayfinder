<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';

	const { data, children } = $props();
	// let unsubscribe: Function;

	// onMount(() => {
	// 	unsubscribe = data.authAPI.onAuthStateChanged(() => {
	// 		// Forces the load function of ./+layout.ts to reload the user with updated state
	// 		invalidate('');
	// 	});
	// });
	// onDestroy(() => {
	// 	if (unsubscribe) unsubscribe();
	// });
</script>

{@render children()}
