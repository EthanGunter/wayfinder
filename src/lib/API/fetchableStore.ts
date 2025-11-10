import { readable, writable, type Readable } from "svelte/store";
import type { Fetchable } from "$domain/fetchable";


export type FetchableStore<T> = Readable<Fetchable<T>>

export function createFetchableReadable<T>(
	start: (set: (value: Fetchable<T>) => void) => void | (() => void),
	initial: Fetchable<T> = { status: "loading" }
): FetchableStore<T> {
	return readable(initial, start);
}

export type QueryableStore<K, T> = Readable<Fetchable<T>> & {
	updateQuery: (params: K) => void;
};

export function createQueryable<K, T>(
	initialParams: K,
	createSubscription: (
		params: K,
		set: (value: Fetchable<T>) => void
	) => void | (() => void),
	initialValue: Fetchable<T> = { status: "loading" }
): QueryableStore<K, T> {
	const store = writable<Fetchable<T>>(initialValue);
	const { subscribe, set, update } = store;

	let currentParams = initialParams;
	let unsubscribe: (() => void) | void = undefined;
	let subscriberCount = 0;

	const startSubscription = (params: K, keepResolved = false) => {
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = undefined;
		}

		// Only reset to loading if we don't have resolved data
		if (!keepResolved) {
			set({ status: "loading" });
		} else {
			update((current) =>
				current.status === "resolved" ? current : { status: "loading" }
			);
		}

		unsubscribe = createSubscription(params, set);
	};

	return {
		subscribe: (fn) => {
			const isFirst = subscriberCount === 0;
			subscriberCount++;

			const unsubscribeStore = subscribe(fn);

			if (isFirst) {
				startSubscription(currentParams);
			}

			return () => {
				unsubscribeStore();
				subscriberCount--;
				if (subscriberCount === 0 && unsubscribe) {
					unsubscribe();
					unsubscribe = undefined;
				}
			};
		},
		updateQuery: (newParams: K) => {
			currentParams = newParams;
			if (subscriberCount > 0) {
				startSubscription(newParams, true);
			}
		}
	};
}

