<script lang="ts">
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';

	interface Props {
		children?: Snippet;
	}
	const { children }: Props = $props();

	function navTo(path: string) {
		// SvelteKit SPA navigation
		if (page.url.pathname.includes(path)) {
			// Refresh the current page data instead of reloading
			invalidateAll();
		} else {
			goto(path);
		}
	}
</script>

<div class="flex items-center justify-between shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] bg-white">
	{#if children}
		{@render children()}
	{:else}
		<Button onclick={() => navTo('/home')} aria-label="Go to home" class="flex-1 bg-transparent text-gray-600">
			<!-- TODO: Replace with real icon - using ChecklistIcon equivalent -->
			<span>✓</span>
		</Button>
		<Button onclick={() => navTo('/tasks')} aria-label="Go to tasks" class="flex-1 bg-transparent text-gray-600 border-l border-gray-600">
			<!-- TODO: Replace with real icon - using AccountTreeIcon equivalent -->
			<span>🌳</span>
		</Button>
	{/if}
</div>
