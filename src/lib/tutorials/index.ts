/** DOM utilities for querying elements, observing rects, and viewport management */
export type { QueryWaitOptions, RectObserverHandle } from './dom';
export { queryOrWait, observeRect, bringToViewIfNeeded } from './dom';

/** Tutorial state management and API */
export type { TutorialState, TutorialsApi } from './store';
export { tutorials } from './store';

/** Tutorial primitive components */
export { default as EventHandler } from './primitives/EventHandler.svelte';
export { default as TGate } from './primitives/TGate.svelte';
export { default as TModal } from './primitives/TModal.svelte';
export { default as TTooltip } from './primitives/TTooltip.svelte';
