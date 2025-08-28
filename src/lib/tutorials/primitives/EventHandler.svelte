<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { queryOrWait } from '../dom';

	let {
		selector,
		type = 'click',
		capture = true,
		once = false,
		passive = false,
		onEvent,
		active = $bindable(true)
	}: {
		selector: string;
		type?: string;
		capture?: boolean;
		once?: boolean;
		passive?: boolean;
		onEvent: (e: Event) => void;
		active?: boolean;
	} = $props();

	let el: Element | null = null;
	let cleanup: (() => void) | null = null;

	onMount(async () => {
		if (!active) return;
		el = await queryOrWait(selector);
		if (!el) return;
		const handler = (e: Event) => {
			onEvent?.(e);
			if (once) {
				cleanup?.();
				active = false;
			}
		};
		el.addEventListener(type as string, handler as EventListener, { capture, passive, once });
		cleanup = () =>
			el?.removeEventListener(type as string, handler as EventListener, { capture } as any);
	});

	onDestroy(() => cleanup?.());
</script>

<!-- No DOM output; purely functional -->
