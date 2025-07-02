<script lang="ts">
	import { onDestroy } from 'svelte';
	import OverlayElement from './OverlayElement.svelte';

	interface Props {
		open: boolean;
		forElement: HTMLElement | string;
		position?: 'top' | 'bottom' | 'left' | 'right' | 'mouse';
		delay?: number;
		followMouse?: boolean;
		dismissSeconds?: number; // 0 = no auto-dismiss
		onclose?: () => void;
		children?: any;
	}

	let {
		open = false,
		forElement,
		position = 'top',
		delay = 500,
		followMouse = false,
		dismissSeconds = 0,
		onclose,
		children
	}: Props = $props();

	let anchorEl: HTMLElement | null = null;
	let tooltipEl: HTMLElement | null = null;
	let mouseX = 0;
	let mouseY = 0;
	let showTooltip = open;
	let timeoutId: number | null = null;
	let dismissTimeout: number | null = null;
	let dismissProgress = 0; // 0 to 1

	// --- Find anchor element ---
	$effect(() => {
		anchorEl = typeof forElement === 'string' ? document.querySelector(forElement) : forElement;
	});

	// --- Tooltip positioning ---
	function updateTooltipPosition(event?: MouseEvent) {
		if (!tooltipEl || !anchorEl) return;
		const tooltipRect = tooltipEl.getBoundingClientRect();
		const anchorRect = anchorEl.getBoundingClientRect();

		let left = 0,
			top = 0;

		if (followMouse || position === 'mouse') {
			if (event) {
				mouseX = event.clientX;
				mouseY = event.clientY;
			}
			left = mouseX + 12;
			top = mouseY + 12;
		} else {
			switch (position) {
				case 'top':
					left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
					top = anchorRect.top - tooltipRect.height - 8;
					break;
				case 'bottom':
					left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
					top = anchorRect.bottom + 8;
					break;
				case 'left':
					left = anchorRect.left - tooltipRect.width - 8;
					top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
					break;
				case 'right':
					left = anchorRect.right + 8;
					top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
					break;
				default:
					left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
					top = anchorRect.top - tooltipRect.height - 8;
			}
		}

		// Clamp to viewport
		const minLeft = 8;
		const maxLeft = window.innerWidth - tooltipRect.width - 8;
		const minTop = 8;
		const maxTop = window.innerHeight - tooltipRect.height - 8;

		tooltipEl.style.left = `${Math.max(minLeft, Math.min(left, maxLeft))}px`;
		tooltipEl.style.top = `${Math.max(minTop, Math.min(top, maxTop))}px`;
	}

	// --- Show/hide logic ---
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
		if (timeoutId) clearTimeout(timeoutId);
		showTooltip = false;
		stopDismissTimer();
	}

	function handleMouseMove(event: MouseEvent) {
		if (followMouse || position === 'mouse') {
			mouseX = event.clientX;
			mouseY = event.clientY;
			if (showTooltip) updateTooltipPosition(event);
		}
	}

	// --- Dismiss timer logic ---
	function startDismissTimer() {
		if (dismissSeconds > 0) {
			let start = performance.now();
			let duration = dismissSeconds * 1000;
			dismissProgress = 0;

			function tick(now: number) {
				if (!showTooltip) return;
				dismissProgress = Math.min(1, (now - start) / duration);
				if (dismissProgress < 1) {
					dismissTimeout = requestAnimationFrame(tick);
				} else {
					showTooltip = false;
					onclose?.();
				}
			}
			dismissTimeout = requestAnimationFrame(tick);
		}
	}

	function stopDismissTimer() {
		if (dismissTimeout) {
			cancelAnimationFrame(dismissTimeout);
			dismissTimeout = null;
		}
		dismissProgress = 0;
	}

	function resetDismissTimer() {
		stopDismissTimer();
		startDismissTimer();
	}

	function handleTooltipMouseOver() {
		resetDismissTimer();
	}

	function handleTooltipClick() {
		showTooltip = false;
		stopDismissTimer();
		onclose?.();
	}

	// --- Mount/unmount logic ---
	$effect(() => {
		if (anchorEl) {
			anchorEl.addEventListener('mouseenter', handleMouseEnter);
			anchorEl.addEventListener('mouseleave', handleMouseLeave);
			if (followMouse || position === 'mouse') {
				anchorEl.addEventListener('mousemove', handleMouseMove);
			}
		}
	});

	$effect(() => {
		if (showTooltip && tooltipEl) {
			setTimeout(() => updateTooltipPosition(), 0);
			if (dismissSeconds > 0) startDismissTimer();
		} else {
			stopDismissTimer();
		}
	});

	// Clean up
	onDestroy(() => {
		if (anchorEl) {
			anchorEl.removeEventListener('mouseenter', handleMouseEnter);
			anchorEl.removeEventListener('mouseleave', handleMouseLeave);
			if (followMouse || position === 'mouse') {
				anchorEl.removeEventListener('mousemove', handleMouseMove);
			}
		}
		stopDismissTimer();
	});
</script>

<OverlayElement
	open={showTooltip}
	className="tooltip tooltip-{position}"
	dismissable={false}
	onclose={() => {
		showTooltip = false;
		onclose?.();
	}}
>
	<div
		bind:this={tooltipEl}
		style="position: fixed; left: 0; top: 0; transform: none;"
		role="tooltip"
		on:mouseover={handleTooltipMouseOver}
		on:click={handleTooltipClick}
	>
		{@render children?.()}
		{#if dismissSeconds > 0}
			<div class="tooltip-dismiss-bar">
				<div class="tooltip-dismiss-bar-fill" style={`width: ${dismissProgress * 100}%;`} />
			</div>
		{/if}
	</div>
</OverlayElement>

<style lang="scss">
	.tooltip {
		background: var(--c-bg_1, #222);
		color: var(--c-text, #fff);
		padding: 0.5rem 0.75rem;
		border-radius: var(--interactible-border-radius, 4px);
		font-size: 0.85rem;
		z-index: 10000;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		pointer-events: auto;
		max-width: 320px;
		word-wrap: break-word;
		animation: tooltip-fade-in 0.15s ease-out;
		cursor: pointer;
	}
	@keyframes tooltip-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.tooltip-dismiss-bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 4px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 0 0 4px 4px;
		overflow: hidden;
		pointer-events: none;
	}
	.tooltip-dismiss-bar-fill {
		height: 100%;
		background: var(--primary-color, #3b82f6);
		transition: width 0.1s linear;
		pointer-events: none;
	}
</style>
