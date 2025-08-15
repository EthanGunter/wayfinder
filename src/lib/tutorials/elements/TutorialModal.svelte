<script lang="ts">
	import { Button } from '@/components/ui/button';

	export interface Props {
		title?: string;
		content: string;
		onNext?: () => void;
		onPrevious?: () => void;
		onSkip?: () => void;
		showControls?: boolean;
		size?: 'small' | 'medium' | 'large';
	}

	const {
		title,
		content,
		onNext,
		onPrevious,
		onSkip,
		showControls = true,
		size = 'medium'
	}: Props = $props();
</script>

<div class="tutorial-modal-backdrop">
	<div class="tutorial-modal {size}">
		{#if title}
			<h2 class="tutorial-title">{title}</h2>
		{/if}
		<div class="tutorial-content">
			{content}
		</div>

		{#if showControls}
			<div class="tutorial-controls">
				{#if onPrevious}
					<Button onclick={onPrevious} class="tutorial-btn secondary">Previous</Button>
				{/if}
				{#if onNext}
					<Button onclick={onNext} class="tutorial-btn primary">Next</Button>
				{/if}
				{#if onSkip}
					<Button onclick={onSkip} class="tutorial-btn skip">Skip Tutorial</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.tutorial-modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10001;
	}

	.tutorial-modal {
		background: var(--background-primary, white);
		border-radius: 8px;
		padding: 2rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		max-height: 80vh;
		overflow-y: auto;
	}

	.tutorial-modal.small {
		max-width: 400px;
		width: 90%;
	}

	.tutorial-modal.medium {
		max-width: 600px;
		width: 90%;
	}

	.tutorial-modal.large {
		max-width: 800px;
		width: 95%;
	}

	.tutorial-title {
		margin: 0 0 1rem 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text-normal, #000);
	}

	.tutorial-content {
		margin-bottom: 2rem;
		color: var(--text-normal, #000);
		line-height: 1.6;
	}

	.tutorial-controls {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.tutorial-btn {
		padding: 0.75rem 1.5rem;
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
</style>
