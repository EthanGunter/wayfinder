<script lang="ts">
	import Tooltip from '$lib/components/TimedTooltip.svelte';

	export interface Props {
		forElement: string | HTMLElement;
		position?: 'top' | 'bottom' | 'left' | 'right' | 'mouse';
		title?: string;
		content: string;
		showControls?: boolean;
		onNext?: () => void;
		onPrevious?: () => void;
		onSkip?: () => void;
	}

	const {
		forElement,
		position = 'top',
		title,
		content,
		showControls = true,
		onNext,
		onPrevious,
		onSkip
	}: Props = $props();
</script>

<Tooltip {forElement} {position} show>
	{#if title}
		<h3 class="tutorial-title">{title}</h3>
	{/if}
	<p class="tutorial-content">{content}</p>

	{#if showControls}
		<div class="tutorial-controls">
			{#if onPrevious}
				<button onclick={onPrevious} class="tutorial-btn secondary">Previous</button>
			{/if}
			{#if onNext}
				<button onclick={onNext} class="tutorial-btn primary">Next</button>
			{/if}
			{#if onSkip}
				<button onclick={onSkip} class="tutorial-btn skip">Skip Tutorial</button>
			{/if}
		</div>
	{/if}
</Tooltip>

<style>
	:global(.tooltip) {
		position: absolute;
		background: var(--background-primary, white);
		border: 1px solid var(--border-color, #ccc);
		border-radius: 8px;
		padding: 1rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		max-width: 300px;
		min-width: 200px;
		z-index: 10001;
	}

	.tutorial-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-normal, #000);
	}

	.tutorial-content {
		margin: 0 0 1rem 0;
		color: var(--text-normal, #000);
		line-height: 1.4;
	}

	.tutorial-controls {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.tutorial-btn {
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-color, #ccc);
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
		background: var(--background-secondary, #f6f8fa);
		color: var(--text-normal, #000);
	}

	.tutorial-btn.skip {
		background: transparent;
		color: var(--text-muted, #666);
		border: none;
		font-size: 0.8rem;
	}

	.tutorial-btn:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	/* Arrow styles */
	.tutorial-tooltip::after {
		content: '';
		position: absolute;
		border: 8px solid transparent;
	}

	.tutorial-tooltip.arrow-top::after {
		border-bottom-color: var(--background-primary, white);
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
	}

	.tutorial-tooltip.arrow-bottom::after {
		border-top-color: var(--background-primary, white);
		bottom: -16px;
		left: 50%;
		transform: translateX(-50%);
	}

	.tutorial-tooltip.arrow-left::after {
		border-right-color: var(--background-primary, white);
		left: -16px;
		top: 50%;
		transform: translateY(-50%);
	}

	.tutorial-tooltip.arrow-right::after {
		border-left-color: var(--background-primary, white);
		right: -16px;
		top: 50%;
		transform: translateY(-50%);
	}
</style>
