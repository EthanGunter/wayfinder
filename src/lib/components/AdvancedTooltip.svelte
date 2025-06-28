<script lang="ts">
	interface Props {
		title?: string;
		content: string;
		position?: 'top' | 'bottom' | 'left' | 'right';
		show?: boolean;
		delay?: number;
		showArrow?: boolean;
		maxWidth?: string;
		children?: any;
		// Advanced props for tutorial-like usage
		onAction?: () => void;
		actionText?: string;
		onDismiss?: () => void;
		dismissText?: string;
	}

	const { 
		title,
		content, 
		position = 'top',
		show = false,
		delay = 0,
		showArrow = true,
		maxWidth = '250px',
		children,
		onAction,
		actionText = 'Got it',
		onDismiss,
		dismissText = 'Dismiss'
	}: Props = $props();

	let tooltipElement: HTMLDivElement;
	let triggerElement: HTMLDivElement;
	let showTooltip = $state(show);
	let timeoutId: number;

	// Watch for external show prop changes
	$effect(() => {
		showTooltip = show;
	});

	function handleMouseEnter() {
		if (show) return; // Don't auto-show if controlled externally
		
		if (delay > 0) {
			timeoutId = window.setTimeout(() => {
				showTooltip = true;
			}, delay);
		} else {
			showTooltip = true;
		}
	}

	function handleMouseLeave() {
		if (show) return; // Don't auto-hide if controlled externally
		
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
		tooltipElement.className = 'advanced-tooltip';
		if (showArrow) {
			tooltipElement.classList.add('with-arrow');
		}

		switch (position) {
			case 'top':
				top = triggerRect.top - tooltipRect.height - (showArrow ? 12 : 8);
				left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
				if (showArrow) tooltipElement.classList.add('arrow-bottom');
				break;
			case 'bottom':
				top = triggerRect.bottom + (showArrow ? 12 : 8);
				left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
				if (showArrow) tooltipElement.classList.add('arrow-top');
				break;
			case 'left':
				top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
				left = triggerRect.left - tooltipRect.width - (showArrow ? 12 : 8);
				if (showArrow) tooltipElement.classList.add('arrow-right');
				break;
			case 'right':
				top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
				left = triggerRect.right + (showArrow ? 12 : 8);
				if (showArrow) tooltipElement.classList.add('arrow-left');
				break;
		}

		// Keep tooltip within viewport
		const padding = 8;
		top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
		left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

		tooltipElement.style.top = `${top}px`;
		tooltipElement.style.left = `${left}px`;
	}

	function handleAction() {
		onAction?.();
		if (!show) showTooltip = false; // Auto-hide if not controlled
	}

	function handleDismiss() {
		onDismiss?.();
		if (!show) showTooltip = false; // Auto-hide if not controlled
	}
</script>

<div 
	bind:this={triggerElement}
	class="tooltip-trigger"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="tooltip"
	aria-describedby={showTooltip ? 'advanced-tooltip' : undefined}
>
	{@render children?.()}
</div>

{#if showTooltip}
	<div 
		bind:this={tooltipElement} 
		class="advanced-tooltip"
		class:with-arrow={showArrow}
		style="max-width: {maxWidth}"
		id="advanced-tooltip"
	>
		{#if title}
			<h4 class="tooltip-title">{title}</h4>
		{/if}
		
		<div class="tooltip-content">{content}</div>

		{#if onAction || onDismiss}
			<div class="tooltip-actions">
				{#if onDismiss}
					<button class="tooltip-btn secondary" onclick={handleDismiss}>
						{dismissText}
					</button>
				{/if}
				{#if onAction}
					<button class="tooltip-btn primary" onclick={handleAction}>
						{actionText}
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	.tooltip-trigger {
		display: contents;
	}

	.advanced-tooltip {
		position: fixed;
		background: var(--c-bg_2);
		color: var(--c-text);
		padding: 1rem;
		border-radius: var(--container-border-radius);
		font-size: 0.9rem;
		z-index: 10000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border: 1px solid var(--c-border);
		pointer-events: auto;
		min-width: 200px;
	}

	.tooltip-title {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--c-text);
	}

	.tooltip-content {
		margin: 0;
		line-height: 1.4;
		color: var(--c-text_1);
	}

	.tooltip-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1rem;
	}

	.tooltip-btn {
		padding: 0.5rem 1rem;
		border: 1px solid var(--c-border);
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.2s ease;

		&.primary {
			background: var(--c-primary);
			color: var(--c-bg_2);
			border-color: var(--c-primary);

			&:hover {
				background: var(--c-primary_-1);
				border-color: var(--c-primary_-1);
			}
		}

		&.secondary {
			background: var(--c-bg_1);
			color: var(--c-text);

			&:hover {
				background: var(--c-bg);
			}
		}
	}

	/* Arrow styles */
	.advanced-tooltip.with-arrow::after {
		content: '';
		position: absolute;
		border: 6px solid transparent;
	}

	.advanced-tooltip.arrow-top::after {
		border-bottom-color: var(--c-bg_2);
		top: -12px;
		left: 50%;
		transform: translateX(-50%);
	}

	.advanced-tooltip.arrow-bottom::after {
		border-top-color: var(--c-bg_2);
		bottom: -12px;
		left: 50%;
		transform: translateX(-50%);
	}

	.advanced-tooltip.arrow-left::after {
		border-right-color: var(--c-bg_2);
		left: -12px;
		top: 50%;
		transform: translateY(-50%);
	}

	.advanced-tooltip.arrow-right::after {
		border-left-color: var(--c-bg_2);
		right: -12px;
		top: 50%;
		transform: translateY(-50%);
	}
</style>