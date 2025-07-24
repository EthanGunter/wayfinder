import { mount } from 'svelte';

// Main tutorial system exports
export { default as Tutorial } from './Tutorial'
export { default as TutorialSystem, getTutorialSystem } from './TutorialSystem'
export { default as LocalStorageTutorialPersistence } from './LocalStoragePersitence'

export type {
	TutorialStep,
	TutorialContext,
	ITutorialPersistence,
	TutorialConfig
} from './types.js';

// Tutorial overlay component
export { default as TutorialOverlay } from './TutorialOverlay.svelte';

// Utility functions for creating tutorial elements
// import type { Props as TooltipProps } from './elements/TutorialTooltip.svelte';
// export async function createTooltip(props: TooltipProps): Promise<HTMLElement> {
// 	const TutorialTooltip = (await import('./elements/TutorialTooltip.svelte')).default;
// 	const container = document.createElement('div');
// 	mount(TutorialTooltip, { props, target: container });
// 	return container.firstElementChild as HTMLElement;
// }

// import type { Props as ModalProps } from './elements/TutorialModal.svelte';
// export async function createModal(props: ModalProps): Promise<HTMLElement> {
// 	const TutorialModal = (await import('./elements/TutorialModal.svelte')).default;
// 	const container = document.createElement('div');
// 	mount(TutorialModal, { props, target: container });
// 	return container.firstElementChild as HTMLElement;
// }

// TODO: createTutorialHighlight later
// export async function createHighlight(props: {
// 	target: string;
// 	style?: 'outline' | 'glow' | 'overlay';
// 	color?: string;
// 	onNext?: () => void;
// 	onPrevious?: () => void;
// 	onSkip?: () => void;
// }): Promise<HTMLElement> {
// 	const TutorialHighlight = (await import('./elements/TutorialHighlight.svelte')).default;
// 	const container = document.createElement('div');
// 	mount(TutorialHighlight, { props, target: container });
// 	return container.firstElementChild as HTMLElement;
// }