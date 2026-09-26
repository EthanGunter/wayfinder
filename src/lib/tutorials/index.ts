/** DOM utilities for querying elements, observing rects, and viewport management */
export type { QueryWaitOptions, RectObserverHandle } from './dom';
export {
	queryOrWait,
	observeRect,
	bringToViewIfNeeded,
	isElementHidden,
	isElementOffscreen,
	isElementFullyInView,
	isNarrowViewport,
	NARROW_BREAKPOINT_PX
} from './dom';

/** Tutorial state management and API */
export type {
	JsonValue,
	TutorialData,
	TutorialRecord,
	TutorialState,
	TutorialStorage,
	TutorialsApi
} from './store';
export { tutorials, createTutorials, parseTutorialState, STORAGE_KEY } from './store';

/** Tutorial ids and shared onboarding data */
export type { OnboardingData, OnboardingTutorialId } from './ids';
export {
	ONBOARDING_WELCOME,
	ONBOARDING_EXAMPLE_PROJECT,
	ONBOARDING_PLANNER,
	ALL_ONBOARDING,
	ONBOARDING_DATA
} from './ids';
export {
	getOnboardingData,
	setOnboardingData,
	onboardingData,
	skipOnboarding,
	replayOnboarding
} from './onboarding';

/** Non-DOM advancement helpers */
export type { OnStoreOptions } from './watch';
export { onStore } from './watch';
export type { DragItemData, ListDropDetail, MonitorListDropsOptions } from './dnd';
export { monitorListDrops } from './dnd';

/** Tutorial primitive components */
export { default as EventHandler } from './primitives/EventHandler.svelte';
export { default as TGate } from './primitives/TGate.svelte';
export { default as TModal } from './primitives/TModal.svelte';
export type { TModalFallbackReason } from './primitives/TModal.svelte';
export { default as TTooltip } from './primitives/TTooltip.svelte';
export { default as StoreWatcher } from './primitives/StoreWatcher.svelte';
export { default as DropWatcher } from './primitives/DropWatcher.svelte';
