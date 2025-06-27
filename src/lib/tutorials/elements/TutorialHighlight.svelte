<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		target: string; // CSS selector for element to highlight
		style?: 'outline' | 'glow' | 'overlay';
		color?: string;
		onNext?: () => void;
		onPrevious?: () => void;
		onSkip?: () => void;
	}

	const { 
		target, 
		style = 'glow', 
		color = 'var(--color-accent, #007acc)',
		onNext,
		onPrevious,
		onSkip
	}: Props = $props();

	let highlightElement: HTMLDivElement;
	let targetElement: Element | null = null;

	onMount(() => {
		targetElement = document.querySelector(target);
		if (targetElement) {
			positionHighlight();
			
			// Re-position on window resize
			const handleResize = () => positionHighlight();
			window.addEventListener('resize', handleResize);
			
			return () => {
				window.removeEventListener('resize', handleResize);
			};
		}
	});

	function positionHighlight() {
		if (!targetElement || !highlightElement) return;

		const rect = targetElement.getBoundingClientRect();
		const padding = 8;

		highlightElement.style.top = `${rect.top - padding}px`;
		highlightElement.style.left = `${rect.left - padding}px`;
		highlightElement.style.width = `${rect.width + padding * 2}px`;
		highlightElement.style.height = `${rect.height + padding * 2}px`;
	}

	function handleKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
			case ' ':
				event.preventDefault();
				onNext?.();
				break;
			case 'Escape':
				event.preventDefault();
				onSkip?.();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				onPrevious?.();
				break;
			case 'ArrowRight':
				event.preventDefault();
				onNext?.();
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div 
	bind:this={highlightElement} 
	class="tutorial-highlight {style}"
	style="--highlight-color: {color}"
	tabindex="0"
	role="button"
	aria-label="Highlighted element - press Enter to continue"
>
	{#if style === 'overlay'}
		<div class="highlight-overlay">
			<div class="highlight-controls">
				{#if onPrevious}
					<button onclick={onPrevious} class="tutorial-btn secondary">Previous</button>
				{/if}
				{#if onNext}
					<button onclick={onNext} class="tutorial-btn primary">Continue</button>
				{/if}
				{#if onSkip}
					<button onclick={onSkip} class="tutorial-btn skip">Skip</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.tutorial-highlight {
		position: absolute;
		pointer-events: none;
		z-index: 10001;
		border-radius: 4px;
		transition: all 0.3s ease;
	}

	.tutorial-highlight:focus {
		outline: 2px solid var(--highlight-color);
		outline-offset: 2px;
	}

	.tutorial-highlight.outline {
		border: 2px solid var(--highlight-color);
		background: transparent;
	}

	.tutorial-highlight.glow {
		border: 2px solid var(--highlight-color);
		background: rgba(0, 122, 204, 0.1);
		box-shadow: 
			0 0 0 2px var(--highlight-color),
			0 0 20px rgba(0, 122, 204, 0.3);
		animation: pulse 2s infinite;
	}

	.tutorial-highlight.overlay {
		background: rgba(0, 122, 204, 0.2);
		border: 2px solid var(--highlight-color);
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.highlight-overlay {
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 1rem;
		border-radius: 4px;
		text-align: center;
	}

	.highlight-controls {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-top: 1rem;
	}

	.tutorial-btn {
		padding: 0.5rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.tutorial-btn.primary {
		background: var(--color-accent, #007acc);
		color: white;
		border-color: var(--color-accent, #007acc);
	}

	.tutorial-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.tutorial-btn.skip {
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		border: none;
		font-size: 0.8rem;
	}

	.tutorial-btn:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 
				0 0 0 2px var(--highlight-color),
				0 0 20px rgba(0, 122, 204, 0.3);
		}
		50% {
			box-shadow: 
				0 0 0 2px var(--highlight-color),
				0 0 30px rgba(0, 122, 204, 0.5);
		}
	}
</style>