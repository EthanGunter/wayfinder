<script lang="ts">
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';
	import { Separator } from './ui/separator';

	interface Props {
		children?: Snippet;
		className?: string;
	}
	const { children, className }: Props = $props();

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

<div
	class="flex items-center justify-between gap-1 bg-white shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] {className}"
>
	{#if children}
		{@render children()}
	{:else}
		<Button
			onclick={() => navTo('/home')}
			aria-label="Go to home"
			class="flex-1 rounded-none bg-transparent text-gray-600"
		>
			<!-- TODO: Replace with real icon - using ChecklistIcon equivalent -->
			<span>✓</span>
		</Button>
		<Separator orientation="vertical" />
		<Button
			onclick={() => navTo('/tasks')}
			aria-label="Go to tasks"
			class="flex-1 rounded-none bg-transparent text-gray-600"
		>
			<!-- TODO: Replace with real icon - using AccountTreeIcon equivalent -->
			<span>🌳</span>
		</Button>
	{/if}
</div>
