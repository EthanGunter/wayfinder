<script lang="ts">
	interface Props {
		content: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		show?: boolean;
		delay?: number;
		children?: any;
	}

	const { 
		content, 
		position = 'top',
		show = false,
		delay = 0,
		children
	}: Props = $props();

	let tooltipElement: HTMLDivElement;
	let triggerElement: HTMLDivElement;
	let showTooltip = $state(show);
	let timeoutId: number;

	function handleMouseEnter() {
		if (delay > 0) {
			timeoutId = window.setTimeout(() => {
				showTooltip = true;
			}, delay);
		} else {
			showTooltip = true;
		}
	}

	function handleMouseLeave() {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		showTooltip = false;
	}

	$effect(() => {
		if (tooltipElement && triggerElement && showTooltip) {
			positionTooltip();
		}
	});

	function positionTooltip() {
		if (!tooltipElement || !triggerElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const tooltipRect = tooltipElement.getBoundingClientRect();

		let top = 0;
		let left = 0;

		// Reset classes
		tooltipElement.className = 'tooltip';

		switch (position) {
			case 'top':
				top = triggerRect.top - tooltipRect.height - 8;
				left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
				tooltipElement.classList.add('arrow-bottom');
				break;
			case 'bottom':
				top = triggerRect.bottom + 8;
				left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
				tooltipElement.classList.add('arrow-top');
				break;
			case 'left':
				top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
				left = triggerRect.left - tooltipRect.width - 8;
				tooltipElement.classList.add('arrow-right');
				break;
			case 'right':
				top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
				left = triggerRect.right + 8;
				tooltipElement.classList.add('arrow-left');
				break;
		}

		// Keep tooltip within viewport
		const padding = 8;
		top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
		left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

		tooltipElement.style.top = `${top}px`;
		tooltipElement.style.left = `${left}px`;
	}
</script>

<div 
	bind:this={triggerElement}
	class="tooltip-trigger"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="tooltip"
	aria-describedby={showTooltip ? 'tooltip' : undefined}
>
	{@render children?.()}
</div>

{#if showTooltip && content}
	<div bind:this={tooltipElement} class="tooltip" id="tooltip">
		{content}
	</div>
{/if}

<style lang="scss">
	.tooltip-trigger {
		display: contents;
	}

	.tooltip {
		position: fixed;
		background: var(--c-neg);
		color: var(--c-bg_2);
		padding: 0.5rem 0.75rem;
		border-radius: var(--interactible-border-radius);
		font-size: 0.85rem;
		white-space: nowrap;
		z-index: 10000;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		pointer-events: none;
		max-width: 250px;
		word-wrap: break-word;
		white-space: normal;
	}

	/* Arrow styles */
	.tooltip::after {
		content: '';
		position: absolute;
		border: 4px solid transparent;
	}

	.tooltip.arrow-top::after {
		border-bottom-color: var(--c-neg);
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip.arrow-bottom::after {
		border-top-color: var(--c-neg);
		bottom: -8px;
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip.arrow-left::after {
		border-right-color: var(--c-neg);
		left: -8px;
		top: 50%;
		transform: translateY(-50%);
	}

	.tooltip.arrow-right::after {
		border-left-color: var(--c-neg);
		right: -8px;
		top: 50%;
		transform: translateY(-50%);
	}
</style>