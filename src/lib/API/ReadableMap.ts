import { SvelteMap } from "svelte/reactivity";
import type { Readable } from "svelte/store";

type Change<K, V> = { op: 'add' | 'set' | 'delete'; key: K; value: V };

export class ReadableMap<K, V> extends SvelteMap<K, V> implements Readable<Change<K, V>> {
	#subs = new Set<(value: Change<K, V>) => void>();

	// Svelte-style convention: returns an unsubscribe function
	subscribe(subFn: (value: Change<K, V>) => void) {
		this.#subs.add(subFn);
		return () => this.#subs.delete(subFn);
	}

	// Notify helpers
	#notify(params: Change<K, V>) {
		for (const fn of this.#subs) fn(params);
	}

	// Mutations
	set(key: K, value: V): this {
		const existed = super.has(key);
		super.set(key, value);
		this.#notify({ op: existed ? 'set' : 'add', key, value });
		return this;
	}

	delete(key: K): boolean {
		const had = super.get(key);
		if (!had) return false;
		const ok = super.delete(key);
		if (ok) this.#notify({ op: 'delete', key, value: had });
		return ok;
	}

	// Optional: clear should emit deletes for each key (granular)
	clear(): void {
		// emit per-key deletes so listeners can update incrementally
		for (const [key, value] of super.entries()) {
			super.delete(key);
			this.#notify({ op: 'delete', key, value });
		}
	}
}
