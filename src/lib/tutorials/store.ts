import { get, writable, type Readable } from 'svelte/store';

/** Any value that survives a JSON round-trip. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

/** Free-form, JSON-serializable data persisted alongside a tutorial's progress. */
export type TutorialData = Record<string, JsonValue | undefined>;

export type TutorialRecord = {
	completed: boolean;
	step: number;
	/** Optional per-tutorial data. Absent on records written before data existed. */
	data?: TutorialData;
};

export type TutorialState = Record<string, TutorialRecord>;

/** Minimal subset of the Web Storage API the tutorial store needs. */
export type TutorialStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_KEY = 'wf.tutorials.v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse a raw storage string into a TutorialState, dropping anything malformed.
 * Accepts records written by older versions (no `data` field).
 */
export function parseTutorialState(raw: string | null | undefined): TutorialState {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!isPlainObject(parsed)) return {};

	const state: TutorialState = {};
	for (const [id, value] of Object.entries(parsed)) {
		if (!isPlainObject(value)) continue;
		const rec: TutorialRecord = {
			completed: Boolean(value.completed),
			step:
				typeof value.step === 'number' && Number.isFinite(value.step) && value.step >= 0
					? Math.floor(value.step)
					: 0
		};
		if (isPlainObject(value.data)) rec.data = value.data as TutorialData;
		state[id] = rec;
	}
	return state;
}

function browserStorage(): TutorialStorage | undefined {
	try {
		return typeof localStorage === 'undefined' ? undefined : localStorage;
	} catch {
		// Accessing localStorage can throw (e.g. blocked site data)
		return undefined;
	}
}

function emptyRecord(): TutorialRecord {
	return { completed: false, step: 0 };
}

/** Storage key for a user's progress; `null` means the anonymous / pre-auth bucket. */
export function storageKeyFor(userId: string | null): string {
	return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function load(storage: TutorialStorage | undefined, key: string): TutorialState {
	try {
		return parseTutorialState(storage?.getItem(key));
	} catch {
		return {};
	}
}

/**
 * Create a tutorial progress store persisted to `storage`, one record per user
 * (see `setUser`). The app uses the `tutorials` singleton below; the factory exists for tests.
 */
export function createTutorials(storage: TutorialStorage | undefined = browserStorage()) {
	let key = storageKeyFor(null);
	const store = writable<TutorialState>(load(storage, key));

	store.subscribe((value) => {
		if (!storage) return;
		try {
			storage.setItem(key, JSON.stringify(value));
		} catch {
			// ignore quota / privacy-mode errors
		}
	});

	/** Apply `fn` to the record for `id` (created if missing) and persist. */
	function updateRecord(id: string, fn: (rec: TutorialRecord) => TutorialRecord): void {
		store.update((s) => ({ ...s, [id]: fn(s[id] ?? emptyRecord()) }));
	}

	function record(id: string): TutorialRecord | undefined {
		return get(store)[id];
	}

	return {
		subscribe: store.subscribe,

		/**
		 * Switch to `userId`'s progress so accounts sharing a browser don't share completion
		 * state. Call before any tutorial reads (e.g. when auth resolves); no-op if unchanged.
		 */
		setUser(userId: string | null): void {
			const next = storageKeyFor(userId);
			if (next === key) return;
			key = next;
			store.set(load(storage, key));
		},

		/** Snapshot of a single tutorial record (undefined if never started). */
		getRecord(id: string): TutorialRecord | undefined {
			return record(id);
		},
		isDone(id: string): boolean {
			return Boolean(record(id)?.completed);
		},
		getStep(id: string): number {
			return record(id)?.step ?? 0;
		},
		/** Jump to a specific step (e.g. when resuming mid-tutorial). No-op once completed. */
		setStep(id: string, step: number): void {
			updateRecord(id, (rec) => (rec.completed ? rec : { ...rec, step: Math.max(0, step) }));
		},
		advance(id: string): void {
			updateRecord(id, (rec) => (rec.completed ? rec : { ...rec, step: (rec.step ?? 0) + 1 }));
		},
		complete(id: string): void {
			updateRecord(id, (rec) => ({ ...rec, completed: true }));
		},
		/** Reset progress AND data for one tutorial. */
		reset(id: string): void {
			store.update((s) => ({ ...s, [id]: emptyRecord() }));
		},

		/** Mark every listed tutorial complete (e.g. "Skip intro"). Data is kept. */
		skipAll(ids: readonly string[]): void {
			store.update((s) => {
				const next = { ...s };
				for (const id of ids) next[id] = { ...(next[id] ?? emptyRecord()), completed: true };
				return next;
			});
		},
		/** Reset progress AND data for every listed tutorial (e.g. "replay tutorial"). */
		resetAll(ids: readonly string[]): void {
			store.update((s) => {
				const next = { ...s };
				for (const id of ids) next[id] = emptyRecord();
				return next;
			});
		},

		/** Data persisted for `id`; `{}` if none. */
		getData<T extends TutorialData = TutorialData>(id: string): Partial<T> {
			return { ...(record(id)?.data ?? {}) } as Partial<T>;
		},
		/**
		 * Shallow-merge `patch` into the data for `id`. Keys set to `undefined` are removed.
		 * Values must be JSON-serializable.
		 */
		setData<T extends TutorialData = TutorialData>(id: string, patch: Partial<T>): void {
			updateRecord(id, (rec) => {
				const data: TutorialData = { ...(rec.data ?? {}) };
				for (const [key, value] of Object.entries(patch)) {
					if (value === undefined) delete data[key];
					else data[key] = value as JsonValue;
				}
				return { ...rec, data };
			});
		},
		/** Remove all data for `id`, keeping progress. */
		clearData(id: string): void {
			updateRecord(id, ({ data: _data, ...rest }) => rest);
		},

		/** Readable of the data for `id`, for reactive use in components (`$data`). */
		data<T extends TutorialData = TutorialData>(id: string): Readable<Partial<T>> {
			return {
				subscribe(run) {
					return store.subscribe((s) => run({ ...(s[id]?.data ?? {}) } as Partial<T>));
				}
			};
		}
	};
}

export type TutorialsApi = ReturnType<typeof createTutorials>;

export const tutorials: TutorialsApi = createTutorials();
