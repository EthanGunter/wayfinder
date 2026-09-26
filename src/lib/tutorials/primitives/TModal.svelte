<script lang="ts" module>
	/** Why an anchored TModal is showing centered instead of next to its anchor. */
	export type TModalFallbackReason = 'missing' | 'hidden' | 'offscreen';
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import {
		queryOrWait,
		bringToViewIfNeeded,
		isElementHidden,
		isElementOffscreen,
		isElementFullyInView,
		isNarrowViewport
	} from '../dom';
	import * as Popover from '$lib/components/ui/popover';
	import { Portal } from 'bits-ui';
	import { cn } from '$lib/utils';
	import { placeFloating, type Placement } from '../placement';
	import TGate from './TGate.svelte';

	type Props = {
		title?: Snippet;
		children?: Snippet;
		primaryLabel?: string;
		onPrimary?: () => void;
		secondaryLabel?: string;
		onSecondary?: () => void;
		open?: boolean;
		/**
		 * Anchor element. Without it the modal is centered. With it, the modal falls back to
		 * centered when the anchor doesn't appear within `anchorTimeoutMs`, is hidden
		 * (zero-size / display:none / visibility:hidden), or — below the sm breakpoint — is
		 * offscreen. It re-anchors automatically if the anchor becomes usable again.
		 *
		 * An anchored modal without buttons is a passive card: it never takes focus, isn't a
		 * dismissable layer and doesn't handle Escape, so it can sit over an open dialog (e.g.
		 * anchored to the dialog itself) without breaking the dialog's focus, Escape or
		 * outside-click behavior. It flips to another side of the anchor rather than cover it.
		 */
		selector?: string;
		placement?: 'top' | 'right' | 'bottom' | 'left';
		/** Dim + block the page (except the anchor). Ignored in fallback when there are no buttons. */
		blockPage?: boolean;
		/** Put a transparent shield over the anchor so it can't be clicked. */
		disableTargetInteraction?: boolean;
		onOutsideClick?: () => void;
		/** Intercept Escape page-wide while open. Without it, Escape is left to the page. */
		onEscapeKey?: () => void;
		/** How long to wait for `selector` before falling back to centered (ms). */
		anchorTimeoutMs?: number;
		/** Called whenever the modal switches to the centered fallback. */
		onFallback?: (reason: TModalFallbackReason) => void;
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
		onEscapeKey,
		anchorTimeoutMs = 3000,
		onFallback
	}: Props = $props();

	function handlePrimary() {
		onPrimary?.();
		open = false;
	}

	function handleSecondary() {
		onSecondary?.();
		open = false;
	}

	// 'pending': waiting for the anchor; 'anchored': popover next to anchor; 'centered': panel.
	let mode = $state<'pending' | 'anchored' | 'centered'>(selector ? 'pending' : 'centered');
	let fallbackReason = $state<TModalFallbackReason | null>(null);
	let anchor = $state<HTMLElement | null>(null);
	let shieldRect = $state<DOMRect | null>(null);
	let cleanupFunctions: (() => void)[] = [];
	let destroyed = false;

	const hasButtons = $derived(Boolean(primaryLabel || secondaryLabel));
	const isFallback = $derived(Boolean(selector) && mode === 'centered');
	// A fallback with no buttons must not block the page: the user has to be able to reach
	// whatever the step is waiting for (or navigate away). Nothing may dead-end.
	const showBackdrop = $derived(isFallback ? blockPage && hasButtons : blockPage);

	function setCentered(reason: TModalFallbackReason) {
		if (mode === 'centered' && fallbackReason === reason) return;
		mode = 'centered';
		fallbackReason = reason;
		onFallback?.(reason);
	}

	function evaluateAnchor() {
		if (!selector || destroyed) return;
		let el = anchor;
		if (!el || !el.isConnected) {
			// The anchor may have been re-rendered or may appear late
			el = document.querySelector<HTMLElement>(selector);
			anchor = el;
		}
		if (!el) return setCentered('missing');
		if (isElementHidden(el)) return setCentered('hidden');
		if (isNarrowViewport() && isElementOffscreen(el)) return setCentered('offscreen');
		if (mode !== 'anchored') {
			mode = 'anchored';
			fallbackReason = null;
		}
	}

	function updateShieldRect() {
		shieldRect = anchor && mode === 'anchored' ? anchor.getBoundingClientRect() : null;
	}

	function startMonitoring() {
		const interval = window.setInterval(evaluateAnchor, 250);
		window.addEventListener('resize', evaluateAnchor);
		window.addEventListener('orientationchange', evaluateAnchor);
		cleanupFunctions.push(() => {
			window.clearInterval(interval);
			window.removeEventListener('resize', evaluateAnchor);
			window.removeEventListener('orientationchange', evaluateAnchor);
		});

		if (disableTargetInteraction) {
			// Track every frame so the shield follows the anchor while scrolling / animating
			let rafId: number;
			const rafUpdate = () => {
				updateShieldRect();
				rafId = requestAnimationFrame(rafUpdate);
			};
			rafId = requestAnimationFrame(rafUpdate);
			cleanupFunctions.push(() => cancelAnimationFrame(rafId));
		}
	}

	onMount(async () => {
		if (!selector) return;
		const el = await queryOrWait<HTMLElement>(selector, { timeoutMs: anchorTimeoutMs });
		if (destroyed) return;
		anchor = el;
		if (el && !isElementHidden(el) && !isElementFullyInView(el)) {
			bringToViewIfNeeded(el);
			// Let the smooth scroll settle before deciding whether the anchor is offscreen
			await new Promise((resolve) => setTimeout(resolve, 400));
			if (destroyed) return;
		}
		evaluateAnchor();
		startMonitoring();
	});

	onDestroy(() => {
		destroyed = true;
		cleanupFunctions.forEach((cleanup) => cleanup());
		cleanupFunctions = [];
	});

	// Passive card (anchored, no buttons): positioned here instead of by a bits-ui Popover
	// Same geometry as the Popover's arrow (which the global `svg` size rule renders at 16px)
	const ARROW_SIZE = 16;
	const PASSIVE_GAP = 8 + ARROW_SIZE; // sideOffset + arrow
	let card = $state<HTMLElement | null>(null);
	let placed = $state<Placement | null>(null);
	const passive = $derived(open && mode === 'anchored' && !!anchor && !hasButtons);

	function updatePlacement() {
		if (!card || !anchor) return;
		const next = placeFloating({
			anchor: anchor.getBoundingClientRect(),
			// offset* ignore the enter animation's scale transform
			floating: { width: card.offsetWidth, height: card.offsetHeight },
			viewport: { width: window.innerWidth, height: window.innerHeight },
			side: placement,
			gap: PASSIVE_GAP
		});
		const p = placed;
		if (
			!p ||
			p.side !== next.side ||
			p.left !== next.left ||
			p.top !== next.top ||
			p.arrow !== next.arrow
		) {
			placed = next;
		}
	}

	$effect(() => {
		if (!passive || !card) return;
		const el = card;
		// Follow the anchor every frame (dialogs animate in, pages scroll)
		let rafId = requestAnimationFrame(function tick() {
			updatePlacement();
			rafId = requestAnimationFrame(tick);
		});
		// Clicking the card must not count as an outside click for a dialog underneath, nor
		// move focus out of it.
		const stop = (e: Event) => e.stopPropagation();
		const keepFocus = (e: Event) => e.preventDefault();
		el.addEventListener('pointerdown', stop);
		el.addEventListener('mousedown', keepFocus);
		return () => {
			cancelAnimationFrame(rafId);
			el.removeEventListener('pointerdown', stop);
			el.removeEventListener('mousedown', keepFocus);
			placed = null;
		};
	});

	// Escape is only intercepted when the step asks for it (a page-wide swallow would stop
	// dialogs and menus underneath from closing).
	$effect(() => {
		if (!open || !onEscapeKey) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
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
	{#if hasButtons}
		<div class="tmodal-footer">
			{#if secondaryLabel}
				<Button variant="outline" onclick={handleSecondary}>{secondaryLabel}</Button>
			{/if}
			{#if primaryLabel}
				<Button onclick={handlePrimary}>{primaryLabel}</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#if open}
	{#if mode === 'anchored' && anchor && selector && !hasButtons}
		{#if blockPage || onOutsideClick}
			<TGate {selector} {onOutsideClick} backdropOpacity={blockPage ? 0.2 : 0} />
		{/if}
		<Portal>
			<div
				bind:this={card}
				role="status"
				data-slot="popover-content"
				data-tmodal-passive=""
				data-state="open"
				data-side={placed?.side}
				class={cn(
					'rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					// pointer-events: modal dialogs set `pointer-events: none` on <body>
					'pointer-events-auto fixed z-[10002] w-80 max-w-[min(90vw,28rem)]'
				)}
				style={placed
					? `left:${placed.left}px; top:${placed.top}px;`
					: 'left:0; top:0; visibility:hidden;'}
			>
				{#if placed && placed.arrow !== null}
					<svg
						class="tmodal-arrow"
						data-side={placed.side}
						viewBox="0 0 16 16"
						style={`width:${ARROW_SIZE}px; height:${ARROW_SIZE}px; ${
							placed.side === 'top' || placed.side === 'bottom' ? 'left' : 'top'
						}:${placed.arrow - ARROW_SIZE / 2}px;`}
						aria-hidden="true"
					>
						<polygon
							points={{
								top: '0,0 16,0 8,16',
								bottom: '0,16 16,16 8,0',
								left: '0,0 16,8 0,16',
								right: '16,0 0,8 16,16'
							}[placed.side]}
							fill="currentColor"
						/>
					</svg>
				{/if}
				{@render content()}
			</div>
		</Portal>
		{#if disableTargetInteraction && shieldRect}
			<div
				class="tmodal-shield"
				style={`left:${shieldRect.x}px; top:${shieldRect.y}px; width:${shieldRect.width}px; height:${shieldRect.height}px;`}
			></div>
		{/if}
	{:else if mode === 'anchored' && anchor && selector}
		<Popover.Root bind:open>
			{#if blockPage || onOutsideClick}
				<TGate {selector} {onOutsideClick} backdropOpacity={blockPage ? 0.2 : 0} />
			{/if}
			<Popover.Trigger style="display:none;" />
			<Popover.Content
				customAnchor={anchor}
				side={placement}
				sideOffset={8}
				class={`z-[10002] w-80 max-w-[min(90vw,28rem,var(--bits-floating-available-width))]`}
				align="center"
				interactOutsideBehavior="defer-otherwise-ignore"
				escapeKeydownBehavior="defer-otherwise-ignore"
				avoidCollisions={true}
				collisionPadding={16}
				trapFocus={false}
			>
				<Popover.Arrow width={26} height={18} style="color: white; top: 1px" />
				{@render content()}
			</Popover.Content>
		</Popover.Root>
		{#if disableTargetInteraction && shieldRect}
			<div
				class="tmodal-shield"
				style={`left:${shieldRect.x}px; top:${shieldRect.y}px; width:${shieldRect.width}px; height:${shieldRect.height}px;`}
			></div>
		{/if}
	{:else if mode === 'centered'}
		{#if showBackdrop}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="tmodal-backdrop" onclick={onOutsideClick}></div>
		{/if}
		<div
			class="tmodal-center-wrap"
			class:tmodal-docked={isFallback && !showBackdrop}
			data-tmodal-fallback={fallbackReason ?? undefined}
		>
			<div class="tmodal-center-panel" role="dialog" aria-modal={showBackdrop}>
				{@render content()}
			</div>
		</div>
	{/if}
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
		padding: 16px;
		z-index: 10002;
		pointer-events: none; /* allow buttons to be clickable only inside panel */
	}
	/* Non-blocking fallback on narrow screens: dock at the bottom so the page stays usable */
	@media (max-width: 639.98px) {
		.tmodal-center-wrap.tmodal-docked {
			place-items: end center;
		}
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
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 12px;
	}
	.tmodal-arrow {
		position: absolute;
		color: white;
	}
	.tmodal-arrow[data-side='top'] {
		top: calc(100% - 1px);
	}
	.tmodal-arrow[data-side='bottom'] {
		bottom: calc(100% - 1px);
	}
	.tmodal-arrow[data-side='left'] {
		left: calc(100% - 1px);
	}
	.tmodal-arrow[data-side='right'] {
		right: calc(100% - 1px);
	}
	.tmodal-shield {
		position: fixed;
		z-index: 10002;
		background: rgba(0, 0, 0, 0);
	}
</style>
