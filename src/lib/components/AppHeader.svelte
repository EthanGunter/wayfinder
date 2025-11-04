<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Sidebar from './ui/sidebar/index.js';

	interface Props {
		left?: Snippet;
		right?: Snippet;
		center?: Snippet;
		class?: string;
		position?: 'top' | 'bottom';
		showSidebarTrigger?: boolean;
	}
	const {
		left,
		right,
		center,
		class: className,
		position = 'top',
		showSidebarTrigger = false
	}: Props = $props();
</script>

<div
	class="page-bar bg-gray flex items-center justify-between gap-4 p-2 text-gray-600 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] {className}"
	data-position={position}
	style="height: var(--header-height);"
>
	{#if left}
		{@render left()}
	{:else if showSidebarTrigger && position === 'top'}
		<Sidebar.Trigger />
	{/if}
	{#if center}
		<div class="flex-1">
			{@render center()}
		</div>
	{/if}
	{#if right}
		{@render right()}
	{/if}
</div>
