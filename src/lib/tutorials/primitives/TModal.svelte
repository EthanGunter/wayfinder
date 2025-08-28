<script lang="ts">
	import { Button } from '@/components/ui/button';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { queryOrWait } from '../dom';
	import * as Popover from '@/components/ui/popover';
	import TGate from './TGate.svelte';

	type Props = {
		title?: Snippet;
		children?: Snippet;
		primaryLabel?: string;
		onPrimary?: () => void;
		secondaryLabel?: string;
		onSecondary?: () => void;
		open?: boolean;
		selector?: string;
		placement?: 'top' | 'right' | 'bottom' | 'left';
		blockPage?: boolean;
		disableTargetInteraction?: boolean;
		onOutsideClick?: () => void;
		onEscapeKey?: () => void;
	};

	let {
		title,
		children,
		primaryLabel,
		onPrimary,
		secondaryLabel,
		onSecondary,
		open = $bindable(true),
		selector,
		placement = 'bottom',
		blockPage = true,
		disableTargetInteraction = false,
		onOutsideClick,
		onEscapeKey
	}: Props = $props();

	function handlePrimary() {
		onPrimary?.();
		open = false;
	}

	function handleSecondary() {
		onSecondary?.();
		open = false;
	}

	// Anchor handling only when selector provided
	let customAnchor = $state<HTMLElement | null>(null);
	let shieldRect = $state<DOMRect | null>(null);
	let cleanupFunctions: (() => void)[] = [];

	function updateShieldRect() {
		if (!customAnchor) return;
		shieldRect = customAnchor.getBoundingClientRect();
	}

	function setupShieldTracking(element: HTMLElement) {
		// Initial update
		updateShieldRect();

		// ResizeObserver for element size changes
		const resizeObserver = new ResizeObserver(updateShieldRect);
		resizeObserver.observe(element);
		cleanupFunctions.push(() => resizeObserver.disconnect());

		// MutationObserver for DOM changes that could affect positioning
		const mutationObserver = new MutationObserver(updateShieldRect);
		mutationObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class']
		});
		cleanupFunctions.push(() => mutationObserver.disconnect());

		// Event listeners for various changes that could affect positioning
		const events = ['scroll', 'resize', 'orientationchange', 'load'];
		const listeners: { event: string; listener: () => void }[] = [];

		events.forEach((event) => {
			const listener = updateShieldRect;
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
			updateShieldRect();
			rafId = requestAnimationFrame(rafUpdate);
		};
		rafId = requestAnimationFrame(rafUpdate);
		cleanupFunctions.push(() => cancelAnimationFrame(rafId));
	}

	onMount(async () => {
		if (!selector) return;
		const target = await queryOrWait(selector);
		if (target instanceof HTMLElement) {
			customAnchor = target;
			if (disableTargetInteraction) {
				setupShieldTracking(target);
			}
		}
	});

	onDestroy(() => {
		cleanupFunctions.forEach((cleanup) => cleanup());
		cleanupFunctions = [];
	});

	// ESC key handling - prevent TModal from closing if onEscapeKey is provided
	$effect(() => {
		if (!open) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				console.log("Preventing tutorial esc");
				
				e.preventDefault();
				e.stopPropagation();
				onEscapeKey?.();
			}
		}

		// Capture phase to intercept before Popover gets it
		document.addEventListener('keydown', handleKeyDown, true);
		return () => document.removeEventListener('keydown', handleKeyDown, true);
	});
</script>

{#snippet content()}
	{#if title}
		<div class="tmodal-title">{@render title()}</div>
	{/if}
	{#if children}
		<div class="tmodal-body">{@render children()}</div>
	{/if}
	<div class="tmodal-footer">
		{#if secondaryLabel}
			<Button variant="outline" onclick={handleSecondary}>{secondaryLabel}</Button>
		{/if}
		{#if primaryLabel}
			<Button onclick={handlePrimary}>{primaryLabel}</Button>
		{/if}
	</div>
{/snippet}

{#if selector}
	<Popover.Root bind:open>
		{#if blockPage || onOutsideClick}
			<TGate bind:active={open} {selector} {onOutsideClick} backdropOpacity={blockPage ? 0.2 : 0} />
		{/if}
		<Popover.Trigger style="display:none;" />
		<Popover.Content
			{customAnchor}
			side={placement}
			sideOffset={8}
			class={`z-[10002] w-80 max-w-[min(90vw,28rem)]`}
			align="center"
			interactOutsideBehavior="ignore"
			avoidCollisions={true}
			collisionPadding={16}
			trapFocus={false}
		>
			<Popover.Arrow width={26} height={18} style="color: white; top: 1px" />
			{@render content()}
		</Popover.Content>
	</Popover.Root>
{:else}
	{#if blockPage}
		<div class="tmodal-backdrop"></div>
	{/if}
	<div class="tmodal-center-wrap">
		<div class={`tmodal-center-panel`}>
			{@render content()}
		</div>
	</div>
{/if}
{#if customAnchor && disableTargetInteraction && shieldRect}
	<div
		class="tmodal-shield"
		style={`position:fixed; left:${shieldRect.x}px; top:${shieldRect.y}px; width:${shieldRect.width}px; height:${shieldRect.height}px; z-index:10002; background:rgba(0,0,0,0);`}
	></div>
{/if}

<style>
	.tmodal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 9999;
	}
	/* Centered panel fallback */
	.tmodal-center-wrap {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		z-index: 10002;
		pointer-events: none; /* allow buttons to be clickable only inside panel */
	}
	.tmodal-center-panel {
		pointer-events: auto;
		background: white;
		color: #111827;
		border-radius: 0.5rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
		width: 20rem;
		max-width: min(90vw, 28rem);
		padding: 12px;
		border: 1px solid #e5e7eb;
	}
	.tmodal-title {
		font-weight: 600;
		margin-bottom: 4px;
		color: #111827;
	}
	.tmodal-body {
		color: #374151;
		font-size: 0.95rem;
	}
	.tmodal-footer {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 12px;
	}
	.tmodal-shield {
		position: fixed;
		z-index: 10002;
		background: rgba(0, 0, 0, 0);
	}
</style>
