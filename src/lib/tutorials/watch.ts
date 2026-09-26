import type { Readable } from 'svelte/store';

export type OnStoreOptions = {
	/** Stop watching after the first match (default true). */
	once?: boolean;
};

/**
 * Call `callback` when `store`'s value satisfies `predicate` — including immediately, if it
 * already does. Use for advancing a tutorial on app state instead of DOM events
 * (e.g. "advance when the selected node becomes X").
 *
 * Returns an unsubscribe function (safe to call more than once).
 */
export function onStore<T>(
	store: Readable<T>,
	predicate: (value: T) => boolean,
	callback: (value: T) => void,
	{ once = true }: OnStoreOptions = {}
): () => void {
	let done = false;
	let unsubscribe: (() => void) | undefined;

	function stop() {
		done = true;
		unsubscribe?.();
		unsubscribe = undefined;
	}

	unsubscribe = store.subscribe((value) => {
		if (done || !predicate(value)) return;
		if (once) done = true;
		callback(value);
		// The first (synchronous) emission happens before `unsubscribe` is assigned;
		// that case is handled right after subscribe returns.
		if (once) unsubscribe?.();
	});

	if (done) stop();
	return stop;
}
