<script lang="ts">
	import { untrack } from 'svelte';

	let {
		selector,
		type = 'click',
		capture = true,
		once = false,
		passive = false,
		onEvent,
		active = $bindable(true)
	}: {
		/** Fires for events whose target is (or is inside) an element matching this selector. */
		selector: string;
		type?: string;
		/**
		 * Listen in the capture phase (default). The listener lives on `document`, so in capture
		 * mode it runs before any handler on the element itself — `preventDefault()` +
		 * `stopImmediatePropagation()` fully intercept the event. With `capture=false` only
		 * bubbling events are seen, after the element's own handlers.
		 */
		capture?: boolean;
		once?: boolean;
		/** Passive listeners can't preventDefault. */
		passive?: boolean;
		onEvent: (e: Event) => void;
		active?: boolean;
	} = $props();

	// Delegated from `document` so it works for elements that mount late or re-render.
	$effect(() => {
		if (!active) return;
		const sel = selector;
		const eventType = type;
		const useCapture = capture;
		const isPassive = passive;

		return untrack(() => {
			let done = false;
			const handler = (e: Event) => {
				if (done) return;
				const target = e.target;
				if (!(target instanceof Element) || !target.closest(sel)) return;
				if (once) {
					done = true;
					active = false;
				}
				onEvent?.(e);
			};
			document.addEventListener(eventType, handler, { capture: useCapture, passive: isPassive });
			return () => document.removeEventListener(eventType, handler, { capture: useCapture });
		});
	});
</script>

<!-- No DOM output; purely functional -->
