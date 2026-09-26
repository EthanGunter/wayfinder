<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { queryOrWait, bringToViewIfNeeded, isElementHidden } from '../dom';

	let {
		selector,
		active = $bindable(true),
		backdropOpacity = 0.2,
		onOutsideClick
	}: {
		selector: string;
		active?: boolean;
		backdropOpacity?: number;
		onOutsideClick?: () => void;
	} = $props();

	let target = $state<Element | null>(null);
	let rect = $state<DOMRect | null>(null);
	let cleanupFunctions: (() => void)[] = [];

	function styleVars(): string {
		if (!rect) return 'display:none;';
		return `--x:${rect.x - 5}px; --y:${rect.y - 5}px; --w:${rect.width + 10}px; --h:${rect.height + 10}px; --alpha:${backdropOpacity};`;
	}

	function updateRect() {
		if (!target) return;
		// The target may have been re-rendered; follow the selector to its replacement.
		if (!target.isConnected) {
			const replacement = document.querySelector(selector);
			if (replacement) target = replacement;
		}
		// Never gate around something the user can't see/click (that would dead-end them).
		if (isElementHidden(target)) {
			if (rect) rect = null;
			return;
		}
		const newRect = target.getBoundingClientRect();
		const rectKey = `${newRect.x}|${newRect.y}|${newRect.width}|${newRect.height}`;
		const currentKey = rect ? `${rect.x}|${rect.y}|${rect.width}|${rect.height}` : '';
		
		if (rectKey !== currentKey) {
			rect = newRect;
		}
	}

	function setupEnhancedTracking(element: Element) {
		// Initial update
		updateRect();

		// ResizeObserver for element size changes
		const resizeObserver = new ResizeObserver(updateRect);
		resizeObserver.observe(element);
		cleanupFunctions.push(() => resizeObserver.disconnect());

		// MutationObserver for DOM changes that could affect positioning
		const mutationObserver = new MutationObserver(updateRect);
		mutationObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'],
		});
		cleanupFunctions.push(() => mutationObserver.disconnect());

		// Event listeners for various changes that could affect positioning
		const events = ['scroll', 'resize', 'orientationchange', 'load'];
		const listeners: { event: string; listener: () => void }[] = [];

		events.forEach((event) => {
			const listener = updateRect;
			window.addEventListener(event, listener, true);
			listeners.push({ event, listener });
		});

		cleanupFunctions.push(() => {
			listeners.forEach(({ event, listener }) => {
				window.removeEventListener(event, listener, true);
			});
		});

		// Continuous monitoring with requestAnimationFrame for smooth updates
		let rafId: number;
		const rafUpdate = () => {
			updateRect();
			rafId = requestAnimationFrame(rafUpdate);
		};
		rafId = requestAnimationFrame(rafUpdate);
		cleanupFunctions.push(() => cancelAnimationFrame(rafId));
	}

	onMount(async () => {
		target = await queryOrWait(selector);
		if (!target) {
			active = false;
			return;
		}
		bringToViewIfNeeded(target);
		setupEnhancedTracking(target);
	});

	onDestroy(() => {
		cleanupFunctions.forEach(cleanup => cleanup());
		cleanupFunctions = [];
	});
</script>

{#if active && rect}
	<div class="tgate-root" style={styleVars()} aria-hidden="true">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tgate-top" onclick={onOutsideClick}></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tgate-left" onclick={onOutsideClick}></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tgate-right" onclick={onOutsideClick}></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="tgate-bottom" onclick={onOutsideClick}></div>
	</div>
{/if}

<style>
	.tgate-root {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 10001; /* Higher than sheet overlays (z-50/z-index: 50) */
	}
	.tgate-top,
	.tgate-bottom,
	.tgate-left,
	.tgate-right {
		position: fixed;
		background: rgba(0, 0, 0, var(--alpha));
		pointer-events: auto;
	}
	.tgate-top {
		left: 0;
		right: 0;
		top: 0;
		height: var(--y);
	}
	.tgate-bottom {
		left: 0;
		right: 0;
		top: calc(var(--y) + var(--h));
		bottom: 0;
	}
	.tgate-left {
		top: var(--y);
		height: var(--h);
		left: 0;
		width: var(--x);
	}
	.tgate-right {
		top: var(--y);
		height: var(--h);
		left: calc(var(--x) + var(--w));
		right: 0;
	}
</style>
