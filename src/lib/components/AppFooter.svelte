<script lang="ts">
	import { goto } from '$app/navigation';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';
	import { Separator } from './ui/separator';
	import Icon from '@iconify/svelte';

	interface Props {
		children?: Snippet;
		className?: string;
	}
	const { children, className }: Props = $props();

	function navTo(path: string) {
		// SvelteKit SPA navigation
		if (page.url.pathname.includes(path)) {
			// Refresh the current page data instead of reloading
			invalidateAll(); // TODO I don't think this does what I thought it did...
		} else {
			goto(path);
		}
	}
	const btnClass =
		'mx-1 h-4/5 flex-1 rounded-lg border-0 bg-transparent text-gray-700 shadow-none transition-colors duration-200 hover:bg-gray-100/80 hover:text-gray-900';
</script>

<div
	class="page-footer flex items-center justify-between gap-1 border-t border-gray-200/50 bg-white/80 shadow-sm backdrop-blur-sm {className}"
>
	{#if children}
		{@render children()}
	{:else}
		<Button
			id="btn-nav-planner"
			onclick={() => navTo('/planner')}
			aria-label="Go to planner"
			class="{btnClass} {page.url.pathname.startsWith('/planner') ? 'bg-gray-200 text-gray-900' : ''}"
		>
			<span class="flex items-center gap-4">
				<Icon icon="lucide:list-todo" class="size-5" />
				<span
					class="font-extralight {page.url.pathname.startsWith('/planner')
						? 'text-gray-900'
						: 'text-gray-600'}">Planner</span
				>
			</span>
		</Button>
		<Separator orientation="vertical" class="h-6 bg-gray-300/60" />
		<Button
			id="btn-nav-tasks"
			onclick={() => goto('/graph')}
			aria-label="Go to tasks"
			class="{btnClass} {page.url.pathname.startsWith('/graph') ? 'bg-gray-200 text-gray-900' : ''}"
		>
			<span class="flex items-center gap-4">
				<Icon icon="mdi:graph" class="size-4" />
				<span
					class="font-extralight {page.url.pathname.startsWith('/graph')
						? 'text-gray-900'
						: 'text-gray-600'}">Graph</span
				>
			</span>
		</Button>
	{/if}
</div>
