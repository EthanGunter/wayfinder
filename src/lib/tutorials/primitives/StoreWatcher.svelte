<script lang="ts" generics="T">
	import { untrack } from 'svelte';
	import type { Readable } from 'svelte/store';
	import { onStore } from '../watch';

	let {
		store,
		when,
		onMatch,
		once = true,
		active = true
	}: {
		/** Any svelte store (or store-contract object). */
		store: Readable<T>;
		/** Fires `onMatch` when this returns true (also on mount if it already matches). */
		when: (value: T) => boolean;
		onMatch: (value: T) => void;
		/** Stop after the first match (default true). */
		once?: boolean;
		active?: boolean;
	} = $props();

	// Re-subscribe only when the store / active / once change; callbacks are read at call time
	// so inline arrow props don't cause churn.
	$effect(() => {
		if (!active) return;
		const s = store;
		const o = once;
		return untrack(() =>
			onStore(
				s,
				(v) => when(v),
				(v) => onMatch(v),
				{ once: o }
			)
		);
	});
</script>

<!-- No DOM output; purely functional -->
