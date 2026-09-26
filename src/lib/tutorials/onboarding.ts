import { tutorials, type TutorialsApi } from './store';
import { ALL_ONBOARDING, ONBOARDING_DATA, type OnboardingData } from './ids';

/** Data shared across the onboarding parts (demo project id, created task ids, replay flag). */
export function getOnboardingData(api: TutorialsApi = tutorials): Partial<OnboardingData> {
	return api.getData<OnboardingData>(ONBOARDING_DATA);
}

/** Shallow-merge into the shared onboarding data. `undefined` values remove keys. */
export function setOnboardingData(
	patch: Partial<OnboardingData>,
	api: TutorialsApi = tutorials
): void {
	api.setData<OnboardingData>(ONBOARDING_DATA, patch);
}

/** Readable of the shared onboarding data, for `$onboardingData` in components. */
export function onboardingData(api: TutorialsApi = tutorials) {
	return api.data<OnboardingData>(ONBOARDING_DATA);
}

/** "Skip walkthrough": mark every onboarding part complete. */
export function skipOnboarding(api: TutorialsApi = tutorials): void {
	api.skipAll(ALL_ONBOARDING);
}

/**
 * "Replay tutorial": clear all onboarding progress and data (stale demo/task ids included),
 * then set the replay flag so Part A starts even if the user already has projects.
 */
export function replayOnboarding(api: TutorialsApi = tutorials): void {
	api.resetAll([...ALL_ONBOARDING, ONBOARDING_DATA]);
	api.setData<OnboardingData>(ONBOARDING_DATA, { replay: true });
}
