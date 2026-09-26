/**
 * Tutorial ids and shared constants. Import ids from here rather than hard-coding strings,
 * so progress stored under wf.tutorials.v1 stays consistent across routes.
 */

/** Part A: welcome + create the example project (/projects). */
export const ONBOARDING_WELCOME = 'onboarding.welcome';
/** Part B: example project walkthrough (/projects/[projectId]). */
export const ONBOARDING_EXAMPLE_PROJECT = 'onboarding.example-project';
/** Part C: planner walkthrough (/planner). */
export const ONBOARDING_PLANNER = 'onboarding.planner';

/** Every onboarding tutorial, in the order they run. */
export const ALL_ONBOARDING = [
	ONBOARDING_WELCOME,
	ONBOARDING_EXAMPLE_PROJECT,
	ONBOARDING_PLANNER
] as const;

export type OnboardingTutorialId = (typeof ALL_ONBOARDING)[number];

/**
 * Record id under which data shared by all onboarding parts is stored
 * (e.g. `tutorials.setData(ONBOARDING_DATA, { demoProjectId })`).
 * It is not a tutorial itself; its progress fields are unused.
 */
export const ONBOARDING_DATA = 'onboarding';

/** Shape of the data stored under ONBOARDING_DATA. */
export type OnboardingData = {
	/** The example project created in Part A ("Go to the ball"). */
	demoProjectId?: string;
	/** "Get dress clothes" task created in Part B (B1). */
	dressId?: string;
	/** "Ask a genie for money" task created in Part B (B6, or by the seed in B7). */
	genieId?: string;
	/** Set by "Replay tutorial" so Part A starts even when the user already has projects. */
	replay?: boolean;
};
