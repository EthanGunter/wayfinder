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

<div bind:this={overlayContainer} class="fixed inset-0 pointer-events-none z-[10000] [&>*]:pointer-events-auto">
	<!-- Tutorial elements get mounted here -->
</div>