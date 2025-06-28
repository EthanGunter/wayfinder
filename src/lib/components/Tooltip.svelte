<script lang="ts">
import { onMount, onDestroy } from 'svelte';

interface Props {
	position?: 'top' | 'bottom' | 'left' | 'right' | 'mouse';
	show?: boolean;
	delay?: number;
	followMouse?: boolean;
	forElement: HTMLElement | string;
	trigger?: HTMLElement | string;
	children?: any;
	constrainToContainer?: boolean;
}

const {
	position = 'top',
	show = false,
	delay = 500,
	followMouse = false,
	children,
	constrainToContainer: constrainInContainer = false,
	forElement,
	trigger
}: Props = $props();

let showTooltip = $state(show);
let timeoutId: number;
let mouseX = $state(0);
let mouseY = $state(0);
let _for: HTMLElement | null = $derived(
	typeof forElement === 'string' ? document.querySelector(forElement) : forElement
);
let _trigger: HTMLElement | null = $derived(
	trigger ? (typeof trigger === 'string' ? document.querySelector(trigger) : trigger) : _for
);
let _tooltip: HTMLDivElement;
let _followMouse = position === 'mouse' || followMouse;

// Tooltip position state (viewport coordinates)
let tooltipLeft = $state<number | null>(null);
let tooltipTop = $state<number | null>(null);

function clamp(val: number, min: number, max: number) {
	return Math.max(min, Math.min(max, val));
}

function updateTooltipPosition(event?: MouseEvent) {
	if (!_tooltip || !_trigger) return;
	const tooltipRect = _tooltip.getBoundingClientRect();
	const triggerRect = _trigger.getBoundingClientRect();

	let left = 0;
	let top = 0;

	if (_followMouse && (position === 'mouse' || !['top','bottom','left','right'].includes(position))) {
		// Mouse-follow: use viewport coordinates for both axes
		if (event) {
			left = event.clientX + 12;
			top = event.clientY + 12;
		} else {
			left = mouseX + 12;
			top = mouseY + 12;
		}
	} else if (_followMouse) {
		// Follow mouse on perpendicular axis only
		if (event) {
			mouseX = event.clientX;
			mouseY = event.clientY;
		}
		switch (position) {
			case 'top':
				left = mouseX - tooltipRect.width / 2;
				top = triggerRect.top - tooltipRect.height - 8;
				break;
			case 'bottom':
				left = mouseX - tooltipRect.width / 2;
				top = triggerRect.bottom + 8;
				break;
			case 'left':
				left = triggerRect.left - tooltipRect.width - 8;
				top = mouseY - tooltipRect.height / 2;
				break;
			case 'right':
				left = triggerRect.right + 8;
				top = mouseY - tooltipRect.height / 2;
				break;
			default:
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.top - tooltipRect.height - 8;
		}
	} else {
		switch (position) {
			case 'top':
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.top - tooltipRect.height - 8;
				break;
			case 'bottom':
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.bottom + 8;
				break;
			case 'left':
				left = triggerRect.left - tooltipRect.width - 8;
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				break;
			case 'right':
				left = triggerRect.right + 8;
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				break;
			default:
				// fallback to top
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.top - tooltipRect.height - 8;
		}
	}

	// Clamp to viewport
	const minLeft = 8;
	const maxLeft = window.innerWidth - tooltipRect.width - 8;
	const minTop = 8;
	const maxTop = window.innerHeight - tooltipRect.height - 8;

	tooltipLeft = clamp(left, minLeft, maxLeft);
	tooltipTop = clamp(top, minTop, maxTop);
}

function handleMouseEnter(event?: MouseEvent) {
	if (delay > 0) {
		timeoutId = window.setTimeout(() => {
			showTooltip = true;
			setTimeout(() => updateTooltipPosition(event), 0);
		}, delay);
	} else {
		showTooltip = true;
		setTimeout(() => updateTooltipPosition(event), 0);
	}
}

function handleMouseLeave() {
	if (timeoutId) {
		clearTimeout(timeoutId);
	}
	showTooltip = false;
}

function handleMouseMove(event: MouseEvent) {
	if (_followMouse && _trigger) {
		mouseX = event.clientX;
		mouseY = event.clientY;
		if (showTooltip) {
			updateTooltipPosition(event);
		}
	}
}

onMount(() => {
	if (_trigger) {
		_trigger.addEventListener('mouseenter', handleMouseEnter);
		_trigger.addEventListener('mouseleave', handleMouseLeave);
		if (_followMouse) {
			_trigger.addEventListener('mousemove', handleMouseMove);
		}
	} else throw new Error('ArgumentError: ');
});

onDestroy(() => {
	if (_trigger) {
		_trigger.removeEventListener('mouseenter', handleMouseEnter);
		_trigger.removeEventListener('mouseleave', handleMouseLeave);
		if (_followMouse) {
			_trigger.removeEventListener('mousemove', handleMouseMove);
		}
	}
});

$effect(() => {
	if (showTooltip) {
		setTimeout(() => updateTooltipPosition(), 0);
	}
});
</script>

{#if showTooltip}
	<div
		bind:this={_tooltip}
		class="tooltip tooltip-{position}"
		class:follow-mouse={_followMouse}
		style={`position: fixed; left: ${tooltipLeft ?? 0}px; top: ${tooltipTop ?? 0}px; transform: none;`}
		role="tooltip"
		id="tooltip"
	>
		{@render children?.()}
	</div>
{/if}

<style lang="scss">
	.tooltip {
		background: var(--c-bg_1, #222);
		color: var(--c-text, #fff);
		padding: 0.5rem 0.75rem;
		border-radius: var(--interactible-border-radius, 4px);
		font-size: 0.85rem;
		z-index: 10000;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		pointer-events: none;
		max-width: 320px;
		word-wrap: break-word;
		// white-space: normal;
		animation: tooltip-fade-in 0.15s ease-out;
	}

	@keyframes tooltip-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Position variants - static positioning */
	.tooltip-mouse.follow-mouse {
		/* No-op, handled by JS */
	}

	.tooltip-top {
		/* No-op, handled by JS */
	}

	.tooltip-bottom {
		/* No-op, handled by JS */
	}

	.tooltip-left {
		/* No-op, handled by JS */
	}

	.tooltip-right {
		/* No-op, handled by JS */
	}

	/* Arrow styles - static positioning */
	.tooltip::after {
		content: '';
		position: absolute;
		border: 4px solid transparent;
	}

	.tooltip-top::after {
		border-top-color: var(--c-bg_1, #222);
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip-bottom::after {
		border-bottom-color: var(--c-bg_1, #222);
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
	}

	.tooltip-left::after {
		border-left-color: var(--c-bg_1, #222);
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
	}

	.tooltip-right::after {
		border-right-color: var(--c-bg_1, #222);
		right: 100%;
		top: 50%;
		transform: translateY(-50%);
	}
</style>
