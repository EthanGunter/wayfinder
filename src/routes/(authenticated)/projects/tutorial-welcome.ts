/**
 * Part A of the onboarding walkthrough (see TutorialWelcome.svelte): welcome the user on
 * /projects and have them create the example project that Part B walks through.
 */
import { tutorials, type TutorialState, type TutorialsApi } from '$lib/tutorials/store';
import { ONBOARDING_DATA, ONBOARDING_WELCOME, type OnboardingData } from '$lib/tutorials/ids';
import { setOnboardingData, skipOnboarding } from '$lib/tutorials/onboarding';

/** Title prefilled in the create dialog for the example project. */
export const DEMO_PROJECT_TITLE = 'Go to the ball 💃🕺';

/** Steps of ONBOARDING_WELCOME. */
export const WelcomeStep = {
	/** A0: "Welcome to Wayfinder alpha!" */
	Intro: 0,
	/** A1: point at the create-project button. */
	CreatePrompt: 1,
	/** The (prefilled) create dialog is open, waiting for "Create Project". */
	CreateDialog: 2
} as const;

/**
 * Whether Part A should start. It auto-starts only for users with zero projects, unless
 * "Replay tutorial" set the replay flag. `projectCount` must come from a resolved query —
 * never pass 0 while projects are still loading, or the tutorial flashes for existing users.
 */
export function shouldStartWelcome(state: TutorialState, projectCount: number): boolean {
	if (state[ONBOARDING_WELCOME]?.completed) return false;
	const data = (state[ONBOARDING_DATA]?.data ?? {}) as Partial<OnboardingData>;
	return projectCount === 0 || data.replay === true;
}

/**
 * The example project was created: hand it to Part B (which only runs on this project),
 * finish Part A and clear the replay flag.
 */
export function completeWelcome(demoProjectId: string, api: TutorialsApi = tutorials): void {
	setOnboardingData({ demoProjectId, replay: undefined }, api);
	api.complete(ONBOARDING_WELCOME);
}

/** "skip walkthrough": no onboarding anywhere afterwards. */
export function skipWelcome(api: TutorialsApi = tutorials): void {
	skipOnboarding(api);
	setOnboardingData({ replay: undefined }, api);
}
