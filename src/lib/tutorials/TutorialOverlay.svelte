<script lang="ts">
	import type { ITutorialPersistence } from './types.js';
	import { onMount } from 'svelte';

	interface Props {
		persistence?: ITutorialPersistence;
	}

	const { persistence }: Props = $props();

	let overlayContainer: HTMLDivElement;

	onMount(async () => {
		// Import the tutorial system and default persistence
		const { getTutorialSystem, LocalStorageTutorialPersistence } = await import('./types.js');
		
		// Use default persistence if none provided
		const defaultPersistence = persistence ?? new LocalStorageTutorialPersistence();
		
		// Initialize the tutorial system
		const tutorialSystem = getTutorialSystem();
		tutorialSystem.initialize(defaultPersistence, overlayContainer);
	});
</script>

<div bind:this={overlayContainer} class="tutorial-overlay">
	<!-- Tutorial elements get mounted here -->
</div>

<style>
	.tutorial-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 10000;
	}

	.tutorial-overlay :global(*) {
		pointer-events: auto;
	}
</style>