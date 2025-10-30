<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { queryOrWait, bringToViewIfNeeded } from '../dom';

	let {
		selector,
		children,
		placement = 'top',
		onDismiss,
		open = $bindable(true)
	}: {
		selector: string;
		children: Snippet;
		placement?: 'top' | 'right' | 'bottom' | 'left';
		onDismiss?: () => void;
		open?: boolean;
	} = $props();

	let target = $state<Element | null>(null);
	let cleanup: (() => void) | null = null;

	onMount(async () => {
		target = await queryOrWait(selector);
		if (!target) {
			// If not found, auto-dismiss
			onDismiss?.();
			return;
		}
		bringToViewIfNeeded(target);

		const dismissHandler = () => {
			open = false;
			onDismiss?.();
		};
		document.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('click', outsideClick, true);
		cleanup = () => {
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('click', outsideClick, true);
		};

		function outsideClick(e: MouseEvent) {
			if (!target) return;
			if (e.target instanceof Node && (target === e.target || target.contains(e.target))) return;
			dismissHandler();
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') dismissHandler();
		}
	});

	onDestroy(() => cleanup?.());
</script>

{#if target && open}
	<Tooltip.Provider>
		<Tooltip.Root open>
			<Tooltip.Content side={placement}>
				{@render children()}
			</Tooltip.Content>
		</Tooltip.Root>
	</Tooltip.Provider>
{/if}
