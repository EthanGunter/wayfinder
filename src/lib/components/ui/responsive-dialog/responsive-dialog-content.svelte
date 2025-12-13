<script lang="ts">
	import * as Dialog from '../dialog';
	import * as Sheet from '../sheet';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { Dialog as DialogPrimitive } from 'bits-ui';
	import type { WithoutChildrenOrChild } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = false,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: DialogPrimitive.PortalProps;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();

	const isMobile = new IsMobile();
</script>

{#if isMobile.current}
	<Sheet.Content
		bind:ref
		side="bottom"
		{portalProps}
		class={cn('mx-auto flex max-h-[85vh] flex-col overflow-hidden rounded-t-xl', className)}
		{...restProps}
	>
		{@render children()}
	</Sheet.Content>
{:else}
	<Dialog.Content
		bind:ref
		{portalProps}
		class={className}
		{...restProps}
	>
		{@render children()}
	</Dialog.Content>
{/if}
