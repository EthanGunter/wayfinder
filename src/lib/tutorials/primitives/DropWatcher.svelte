<script lang="ts">
	import { untrack } from 'svelte';
	import { monitorListDrops, type ListDropDetail } from '../dnd';

	let {
		listId,
		onDrop,
		requireMove = false,
		includeMisses = false,
		once = false,
		active = true
	}: {
		/** Drag data `listId` of the list to watch (e.g. the TaskList `id`). */
		listId: string;
		onDrop: (detail: ListDropDetail) => void;
		/** Only report drops that actually changed the item's position (default false). */
		requireMove?: boolean;
		/** Also report drops that missed the list (default false). */
		includeMisses?: boolean;
		/** Stop after the first reported drop (default false). */
		once?: boolean;
		active?: boolean;
	} = $props();

	let fired = false;

	$effect(() => {
		if (!active) return;
		const id = listId;
		const misses = includeMisses;
		return untrack(() => {
			if (once && fired) return;
			let cleanup: (() => void) | undefined = monitorListDrops(
				id,
				(detail) => {
					if (once && fired) return;
					if (requireMove && !detail.moved) return;
					fired = true;
					onDrop(detail);
					if (once) {
						cleanup?.();
						cleanup = undefined;
					}
				},
				{ includeMisses: misses }
			);
			return () => {
				cleanup?.();
				cleanup = undefined;
			};
		});
	});
</script>

<!-- No DOM output; purely functional -->
