import { writable, type Writable } from 'svelte/store';

type TutorialRecord = {
  completed: boolean;
  step: number;
};

export type TutorialState = Record<string, TutorialRecord>;

const STORAGE_KEY = 'wf.tutorials.v1';

function loadFromStorage(): TutorialState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TutorialState;
    // Guard against bad data
    for (const key in parsed) {
      const rec = parsed[key] as Partial<TutorialRecord>;
      if (!rec || typeof rec !== 'object') delete (parsed as any)[key];
      else {
        (parsed as any)[key] = {
          completed: Boolean(rec.completed),
          step: Number.isFinite(rec.step as number) ? (rec.step as number) : 0,
        } satisfies TutorialRecord;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveToStorage(state: TutorialState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const initial: TutorialState = loadFromStorage();
const store: Writable<TutorialState> = writable(initial);

store.subscribe((value) => saveToStorage(value));

function ensure(state: TutorialState, id: string): TutorialRecord {
  if (!state[id]) state[id] = { completed: false, step: 0 };
  return state[id]!;
}

export const tutorials = {
  subscribe: store.subscribe,
  isDone(id: string): boolean {
    let value: TutorialState;
    let done = false;
    const unsub = store.subscribe((v) => (value = v));
    unsub();
    done = Boolean(value![id]?.completed);
    return done;
  },
  getStep(id: string): number {
    let value: TutorialState;
    const unsub = store.subscribe((v) => (value = v));
    unsub();
    return value![id]?.step ?? 0;
  },
  advance(id: string): void {
    store.update((s) => {
      const rec = ensure(s, id);
      if (!rec.completed) rec.step = (rec.step ?? 0) + 1;
      return s;
    });
  },
  complete(id: string): void {
    store.update((s) => {
      const rec = ensure(s, id);
      rec.completed = true;
      return s;
    });
  },
  reset(id: string): void {
    store.update((s) => {
      s[id] = { completed: false, step: 0 };
      return s;
    });
  },
};

export type TutorialsApi = typeof tutorials;


