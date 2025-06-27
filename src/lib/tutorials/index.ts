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

// Pre-built tutorial elements
export { default as TutorialTooltip } from './elements/TutorialTooltip.svelte';
export { default as TutorialModal } from './elements/TutorialModal.svelte';
export { default as TutorialHighlight } from './elements/TutorialHighlight.svelte';

// Utility functions for creating tutorial elements
export async function createTooltip(props: {
	title?: string;
	content: string;
	target?: string;
	position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
	onNext?: () => void;
	onPrevious?: () => void;
	onSkip?: () => void;
}): Promise<HTMLElement> {
	const TutorialTooltip = (await import('./elements/TutorialTooltip.svelte')).default;
	const container = document.createElement('div');
	mount(TutorialTooltip, { props, target: container });
	return container.firstElementChild as HTMLElement;
}

export async function createModal(props: {
	title?: string;
	content: string;
	size?: 'small' | 'medium' | 'large';
	onNext?: () => void;
	onPrevious?: () => void;
	onSkip?: () => void;
}): Promise<HTMLElement> {
	const TutorialModal = (await import('./elements/TutorialModal.svelte')).default;
	const container = document.createElement('div');
	mount(TutorialModal, { props, target: container });
	return container.firstElementChild as HTMLElement;
}

export async function createHighlight(props: {
	target: string;
	style?: 'outline' | 'glow' | 'overlay';
	color?: string;
	onNext?: () => void;
	onPrevious?: () => void;
	onSkip?: () => void;
}): Promise<HTMLElement> {
	const TutorialHighlight = (await import('./elements/TutorialHighlight.svelte')).default;
	const container = document.createElement('div');
	mount(TutorialHighlight, { props, target: container });
	return container.firstElementChild as HTMLElement;
}