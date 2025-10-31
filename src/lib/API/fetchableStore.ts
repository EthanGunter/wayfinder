import { readable, type Readable } from "svelte/store";
import type { Fetchable } from "$domain/fetchable";

export type FetchableReadable<T> = Readable<Fetchable<T>>

export function createFetchableReadable<T>(
	start: (set: (value: Fetchable<T>) => void) => void | (() => void),
	initial: Fetchable<T> = { status: "loading" }
): FetchableReadable<T> {
	return readable(initial, start);
}

