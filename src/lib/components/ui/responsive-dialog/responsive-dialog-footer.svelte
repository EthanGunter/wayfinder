<script lang="ts">
	import * as Dialog from '../dialog';
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		sticky = false,
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		sticky?: boolean;
		children: Snippet;
	} = $props();
</script>

<Dialog.Footer class={cn(sticky && 'shrink-0', className)} {...restProps}>
	{@render children()}
</Dialog.Footer>

