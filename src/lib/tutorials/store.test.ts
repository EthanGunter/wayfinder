import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import { createTutorials, parseTutorialState, STORAGE_KEY, storageKeyFor, type TutorialStorage } from './store';
import { ALL_ONBOARDING, ONBOARDING_DATA, ONBOARDING_WELCOME } from './ids';
import { getOnboardingData, replayOnboarding, setOnboardingData, skipOnboarding } from './onboarding';
import { onStore } from './watch';

function memoryStorage(initial?: Record<string, string>) {
	const map = new Map<string, string>(Object.entries(initial ?? {}));
	const storage: TutorialStorage = {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value)
	};
	return { storage, map, saved: () => JSON.parse(map.get(STORAGE_KEY) ?? '{}') };
}

describe('parseTutorialState', () => {
	it('parses records written before data existed', () => {
		const raw = JSON.stringify({
			'home.welcome': { completed: true, step: 2 },
			'tasks.example-project': { completed: false, step: 5 }
		});
		expect(parseTutorialState(raw)).toEqual({
			'home.welcome': { completed: true, step: 2 },
			'tasks.example-project': { completed: false, step: 5 }
		});
	});

	it('keeps object data and drops non-object data', () => {
		const raw = JSON.stringify({
			a: { completed: false, step: 1, data: { demoProjectId: 'p1', nested: { x: [1, 2] } } },
			b: { completed: false, step: 1, data: 'nope' },
			c: { completed: false, step: 1, data: [1, 2] }
		});
		const state = parseTutorialState(raw);
		expect(state.a.data).toEqual({ demoProjectId: 'p1', nested: { x: [1, 2] } });
		expect(state.b).toEqual({ completed: false, step: 1 });
		expect(state.c).toEqual({ completed: false, step: 1 });
	});

	it('guards against malformed input', () => {
		expect(parseTutorialState(null)).toEqual({});
		expect(parseTutorialState('')).toEqual({});
		expect(parseTutorialState('{not json')).toEqual({});
		expect(parseTutorialState('[1,2]')).toEqual({});
		expect(parseTutorialState('"str"')).toEqual({});
		expect(
			parseTutorialState(
				JSON.stringify({
					bad: null,
					arr: [1],
					weird: { completed: 'yes', step: 'three' },
					neg: { completed: false, step: -4 },
					frac: { step: 2.7 }
				})
			)
		).toEqual({
			weird: { completed: true, step: 0 },
			neg: { completed: false, step: 0 },
			frac: { completed: false, step: 2 }
		});
	});
});

describe('createTutorials', () => {
	it('loads existing (old-format) records from storage and keeps working', () => {
		const { storage, saved } = memoryStorage({
			[STORAGE_KEY]: JSON.stringify({ t: { completed: false, step: 3 } })
		});
		const t = createTutorials(storage);
		expect(t.getStep('t')).toBe(3);
		expect(t.isDone('t')).toBe(false);
		expect(t.getData('t')).toEqual({});
		t.advance('t');
		expect(saved()).toEqual({ t: { completed: false, step: 4 } });
	});

	it('works without storage', () => {
		const t = createTutorials(undefined);
		t.advance('x');
		expect(t.getStep('x')).toBe(1);
	});

	it('survives a storage that throws', () => {
		const t = createTutorials({
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('quota');
			}
		});
		t.complete('x');
		expect(t.isDone('x')).toBe(true);
	});

	it('advances, sets step, completes and resets', () => {
		const t = createTutorials(memoryStorage().storage);
		expect(t.getStep('x')).toBe(0);
		expect(t.getRecord('x')).toBeUndefined();
		t.advance('x');
		t.advance('x');
		expect(t.getStep('x')).toBe(2);
		t.setStep('x', 5);
		expect(t.getStep('x')).toBe(5);
		t.complete('x');
		t.advance('x');
		t.setStep('x', 0);
		expect(t.getStep('x')).toBe(5);
		expect(t.isDone('x')).toBe(true);
		t.reset('x');
		expect(t.getRecord('x')).toEqual({ completed: false, step: 0 });
	});

	it('persists data and restores it in a new instance', () => {
		const mem = memoryStorage();
		const t = createTutorials(mem.storage);
		t.setData('onboarding', { demoProjectId: 'p1' });
		t.setData('onboarding', { dressId: 'd1' });
		expect(t.getData('onboarding')).toEqual({ demoProjectId: 'p1', dressId: 'd1' });
		expect(mem.saved().onboarding).toEqual({
			completed: false,
			step: 0,
			data: { demoProjectId: 'p1', dressId: 'd1' }
		});

		const reloaded = createTutorials(mem.storage);
		expect(reloaded.getData<{ demoProjectId: string }>('onboarding').demoProjectId).toBe('p1');
	});

	it('removes keys set to undefined and clears data', () => {
		const t = createTutorials(memoryStorage().storage);
		t.setData('x', { a: 1, b: 'two' });
		t.setData('x', { a: undefined });
		expect(t.getData('x')).toEqual({ b: 'two' });
		t.advance('x');
		t.clearData('x');
		expect(t.getRecord('x')).toEqual({ completed: false, step: 1 });
	});

	it('does not let callers mutate stored data through getData', () => {
		const t = createTutorials(memoryStorage().storage);
		t.setData('x', { a: 1 });
		const data = t.getData('x');
		data.a = 2;
		expect(t.getData('x')).toEqual({ a: 1 });
	});

	it('keeps progress when setting data and data when advancing', () => {
		const t = createTutorials(memoryStorage().storage);
		t.advance('x');
		t.setData('x', { a: 1 });
		t.advance('x');
		expect(t.getRecord('x')).toEqual({ completed: false, step: 2, data: { a: 1 } });
	});

	it('skipAll completes every listed tutorial and leaves others alone', () => {
		const t = createTutorials(memoryStorage().storage);
		t.advance('a');
		t.setData('a', { keep: true });
		t.advance('other');
		t.skipAll(['a', 'b', 'c']);
		expect(['a', 'b', 'c'].every((id) => t.isDone(id))).toBe(true);
		expect(t.getRecord('a')).toEqual({ completed: true, step: 1, data: { keep: true } });
		expect(t.isDone('other')).toBe(false);
		expect(t.getStep('other')).toBe(1);
	});

	it('resetAll resets progress and data for listed tutorials only', () => {
		const t = createTutorials(memoryStorage().storage);
		t.complete('a');
		t.setData('a', { x: 1 });
		t.advance('b');
		t.complete('other');
		t.resetAll(['a', 'b']);
		expect(t.getRecord('a')).toEqual({ completed: false, step: 0 });
		expect(t.getRecord('b')).toEqual({ completed: false, step: 0 });
		expect(t.isDone('other')).toBe(true);
	});

	it('exposes a reactive data store', () => {
		const t = createTutorials(memoryStorage().storage);
		const data = t.data<{ id: string }>('x');
		expect(get(data)).toEqual({});
		t.setData('x', { id: 'abc' });
		expect(get(data)).toEqual({ id: 'abc' });
	});

	it('is itself a readable store of the whole state', () => {
		const t = createTutorials(memoryStorage().storage);
		t.advance('x');
		expect(get(t)).toEqual({ x: { completed: false, step: 1 } });
	});
});

describe('per-user progress', () => {
	it('keeps each user\'s progress separate in the same browser', () => {
		const { storage, map } = memoryStorage();
		const t = createTutorials(storage);

		t.setUser('alice');
		t.complete(ONBOARDING_WELCOME);
		t.setData(ONBOARDING_DATA, { demoProjectId: 'p1' });

		t.setUser('bob');
		expect(t.isDone(ONBOARDING_WELCOME)).toBe(false);
		expect(t.getData(ONBOARDING_DATA)).toEqual({});

		t.setUser('alice');
		expect(t.isDone(ONBOARDING_WELCOME)).toBe(true);
		expect(t.getData(ONBOARDING_DATA)).toEqual({ demoProjectId: 'p1' });
		expect(JSON.parse(map.get(storageKeyFor('alice'))!)[ONBOARDING_WELCOME].completed).toBe(true);
		expect(map.has(storageKeyFor('bob'))).toBe(true);
	});

	it('does not hand the pre-auth (legacy) record to a signed-in user', () => {
		const { storage } = memoryStorage({
			[STORAGE_KEY]: JSON.stringify({ [ONBOARDING_WELCOME]: { completed: true, step: 1 } })
		});
		const t = createTutorials(storage);
		expect(t.isDone(ONBOARDING_WELCOME)).toBe(true);
		t.setUser('new-user');
		expect(t.isDone(ONBOARDING_WELCOME)).toBe(false);
	});

	it('notifies subscribers when the user changes', () => {
		const { storage } = memoryStorage();
		const t = createTutorials(storage);
		t.setUser('alice');
		t.complete(ONBOARDING_WELCOME);
		t.setUser('bob');
		expect(get(t)[ONBOARDING_WELCOME]).toBeUndefined();
	});
});

describe('onboarding helpers', () => {
	it('stores shared data under ONBOARDING_DATA', () => {
		const t = createTutorials(memoryStorage().storage);
		setOnboardingData({ demoProjectId: 'p1' }, t);
		expect(getOnboardingData(t)).toEqual({ demoProjectId: 'p1' });
		expect(t.getData(ONBOARDING_DATA)).toEqual({ demoProjectId: 'p1' });
	});

	it('skipOnboarding completes every onboarding tutorial', () => {
		const t = createTutorials(memoryStorage().storage);
		skipOnboarding(t);
		expect(ALL_ONBOARDING.every((id) => t.isDone(id))).toBe(true);
	});

	it('replayOnboarding clears progress and stale ids, then sets the replay flag', () => {
		const t = createTutorials(memoryStorage().storage);
		skipOnboarding(t);
		setOnboardingData({ demoProjectId: 'p1', dressId: 'd1', genieId: 'g1' }, t);
		replayOnboarding(t);
		expect(ALL_ONBOARDING.some((id) => t.isDone(id))).toBe(false);
		expect(t.getStep(ONBOARDING_WELCOME)).toBe(0);
		expect(getOnboardingData(t)).toEqual({ replay: true });
	});
});

describe('onStore', () => {
	it('fires immediately when the value already matches, then stops', () => {
		const s = writable(5);
		const seen: number[] = [];
		onStore(
			s,
			(v) => v > 3,
			(v) => seen.push(v)
		);
		s.set(10);
		expect(seen).toEqual([5]);
	});

	it('fires once on the first matching update', () => {
		const s = writable<string | null>(null);
		const seen: (string | null)[] = [];
		onStore(
			s,
			(v) => v === 'b',
			(v) => seen.push(v)
		);
		s.set('a');
		s.set('b');
		s.set('b2');
		s.set('b');
		expect(seen).toEqual(['b']);
	});

	it('keeps firing with once=false until unsubscribed', () => {
		const s = writable(0);
		const seen: number[] = [];
		const stop = onStore(
			s,
			(v) => v % 2 === 0,
			(v) => seen.push(v),
			{ once: false }
		);
		s.set(1);
		s.set(2);
		s.set(4);
		stop();
		s.set(6);
		expect(seen).toEqual([0, 2, 4]);
	});

	it('does not fire after being stopped', () => {
		const s = writable(0);
		let calls = 0;
		const stop = onStore(
			s,
			(v) => v === 1,
			() => calls++
		);
		stop();
		s.set(1);
		expect(calls).toBe(0);
	});
});
