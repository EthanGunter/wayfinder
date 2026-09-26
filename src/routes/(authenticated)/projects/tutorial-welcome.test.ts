import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createTutorials, type TutorialStorage } from '$lib/tutorials/store';
import {
	ALL_ONBOARDING,
	ONBOARDING_DATA,
	ONBOARDING_EXAMPLE_PROJECT,
	ONBOARDING_WELCOME
} from '$lib/tutorials/ids';
import { getOnboardingData, replayOnboarding } from '$lib/tutorials/onboarding';
import { completeWelcome, shouldStartWelcome, skipWelcome } from './tutorial-welcome';

function memoryTutorials() {
	const map = new Map<string, string>();
	const storage: TutorialStorage = {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value)
	};
	return createTutorials(storage);
}

describe('shouldStartWelcome', () => {
	it('auto-starts only for users with zero projects', () => {
		const api = memoryTutorials();
		expect(shouldStartWelcome(get(api), 0)).toBe(true);
		expect(shouldStartWelcome(get(api), 3)).toBe(false);
	});

	it('never starts once completed', () => {
		const api = memoryTutorials();
		api.complete(ONBOARDING_WELCOME);
		expect(shouldStartWelcome(get(api), 0)).toBe(false);
	});

	it('starts for users with projects after "Replay tutorial"', () => {
		const api = memoryTutorials();
		api.skipAll(ALL_ONBOARDING);
		replayOnboarding(api);
		expect(shouldStartWelcome(get(api), 3)).toBe(true);
	});
});

describe('completeWelcome', () => {
	it('stores the demo project, completes Part A and clears the replay flag', () => {
		const api = memoryTutorials();
		replayOnboarding(api);
		completeWelcome('project-123', api);

		expect(api.isDone(ONBOARDING_WELCOME)).toBe(true);
		expect(api.isDone(ONBOARDING_EXAMPLE_PROJECT)).toBe(false);
		expect(getOnboardingData(api)).toEqual({ demoProjectId: 'project-123' });
		expect(shouldStartWelcome(get(api), 1)).toBe(false);
	});
});

describe('skipWelcome', () => {
	it('completes every onboarding part and clears the replay flag', () => {
		const api = memoryTutorials();
		replayOnboarding(api);
		skipWelcome(api);

		for (const id of ALL_ONBOARDING) expect(api.isDone(id)).toBe(true);
		expect(api.getData(ONBOARDING_DATA)).toEqual({});
		expect(shouldStartWelcome(get(api), 0)).toBe(false);
	});
});
