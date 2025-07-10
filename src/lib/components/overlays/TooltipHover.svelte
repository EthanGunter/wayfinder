<!-- @component
NOTE: This component doesn't work on mobile...
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import OverlayElement from './OverlayElement.svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		forElement: HTMLElement | string;
		position?: 'top' | 'bottom' | 'left' | 'right' | 'mouse';
		delay?: number;
		followMouse?: boolean;
		onclose?: () => void;
		children?: any;
	}

	let {
		forElement,
		position = 'top',
		delay = 500,
		followMouse = false,
		onclose,
		children,
		...rest
	}: Props = $props();

	let timeoutId = $state(0);
	let open = $state(false);
	let triggerEl = $state<HTMLElement>();
	let tooltipEl = $state<HTMLDivElement>();
	let mouseX = $state(0);
	let mouseY = $state(0);
	let tooltipLeft = $state(0);
	let tooltipTop = $state(0);

	// --- Tooltip positioning ---
	function updateTooltipPosition(event?: MouseEvent) {
		if (!tooltipEl || !triggerEl) return;
		const tooltipRect = tooltipEl.getBoundingClientRect();
		const triggerRect = triggerEl.getBoundingClientRect();

		let left = 0;
		let top = 0;

		if (
			followMouse &&
			(position === 'mouse' || !['top', 'bottom', 'left', 'right'].includes(position))
		) {
			// Mouse-follow: use viewport coordinates for both axes
			if (event) {
				left = event.clientX + 12;
				top = event.clientY + 12;
			} else {
				left = mouseX + 12;
				top = mouseY + 12;
			}
		} else if (followMouse) {
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

		//Math.max(min, Math.min(max, val));
		tooltipLeft = Math.max(left, Math.min(minLeft, maxLeft));
		tooltipTop = Math.max(top, Math.min(minTop, maxTop));
	}

	// --- Show/hide logic ---
	function handleMouseEnter(event?: MouseEvent) {
		if (delay > 0) {
			timeoutId = window.setTimeout(() => {
				open = true;
				setTimeout(() => updateTooltipPosition(event), 0);
			}, delay);
		} else {
			open = true;
			setTimeout(() => updateTooltipPosition(event), 0);
		}
	}

	function handleMouseLeave() {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		open = false;
	}

	function handleMouseMove(event: MouseEvent) {
		if (followMouse || position === 'mouse') {
			mouseX = event.clientX;
			mouseY = event.clientY;
			if (open) updateTooltipPosition(event);
		}
	}

	$effect(() => {
		triggerEl =
			typeof forElement === 'string'
				? (document.querySelector(forElement) as HTMLElement)
				: forElement;
	});

	$effect(() => {
		if (!triggerEl) return;
		if (followMouse || position === 'mouse') {
			triggerEl.addEventListener('mousemove', handleMouseMove);
		}
	});

	$effect(() => {
		if (open && tooltipEl) {
			setTimeout(() => updateTooltipPosition(), 0);
		}
	});

	// --- Mount/unmount logic ---
	onMount(() => {
		if (triggerEl) {
			triggerEl.addEventListener('mouseenter', handleMouseEnter);
			triggerEl.addEventListener('mouseleave', handleMouseLeave);
			if (followMouse) {
				triggerEl.addEventListener('mousemove', handleMouseMove);
			}
		} else {
			if (typeof forElement === 'string') {
				throw new Error(`ArgumentError: failed to find target element: ${forElement}`);
			} else {
				throw new Error(`ArgumentError: forElement is ${forElement}`);
			}
		}
	});
	onDestroy(() => {
		if (triggerEl) {
			triggerEl.removeEventListener('mouseenter', handleMouseEnter);
			triggerEl.removeEventListener('mouseleave', handleMouseLeave);
			if (followMouse) {
				triggerEl.removeEventListener('mousemove', handleMouseMove);
			}
		}
	});
</script>

<OverlayElement
	bind:popoverEl={tooltipEl}
	{open}
	class="tooltip tooltip-{position}"
	dismissable={false}
	style={`position: fixed; left: ${tooltipLeft ?? 0}px; top: ${tooltipTop ?? 0}px; transform: none;`}
	onclose={() => {
		open = false;
		onclose?.();
	}}
	role="tooltip"
	{...rest}
>
	{@render children?.()}
</OverlayElement>

<style lang="scss">
	:global(.tooltip) {
		background: var(--c-bg_1, #222);
		color: var(--c-text, #fff);
		padding: 0.5rem 0.75rem;
		border-radius: var(--interactible-border-radius, 4px);
		// font-size: 0.85rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		max-width: 320px;
	}
</style>
