<script lang="ts">
	import * as Dialog from '../dialog';
	import * as Sheet from '../sheet';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		children
	}: {
		open?: boolean;
		children: Snippet;
	} = $props();

	const isMobile = new IsMobile();
</script>

{#if isMobile.current}
	<Sheet.Root bind:open>
		{@render children()}
	</Sheet.Root>
{:else}
	<Dialog.Root bind:open>
		{@render children()}
	</Dialog.Root>
{/if}

