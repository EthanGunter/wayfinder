<script lang="ts">
	import { Button } from '@/components/ui/button';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { queryOrWait } from '../dom';
	import * as Popover from '@/components/ui/popover';
	import TGate from './TGate.svelte';

	let {
		title = '',
		children,
		primaryLabel,
		secondaryLabel,
		onPrimary,
		onSecondary,
		open = $bindable(true),
		selector,
		placement = 'bottom',
		offset = 24,
		blockPage = true,
		disableTargetInteraction = false,
		screenMargin = 6
	}: {
		title?: string;
		children?: Snippet;
		primaryLabel?: string;
		secondaryLabel?: string;
		onPrimary?: () => void;
		onSecondary?: () => void;
		open?: boolean;
		selector?: string;
		placement?: 'top' | 'right' | 'bottom' | 'left';
		offset?: number;
		blockPage?: boolean;
		disableTargetInteraction?: boolean;
		screenMargin?: number;
	} = $props();

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

	onMount(async () => {
		if (!selector) return;
		const target = await queryOrWait(selector);
		if (target instanceof HTMLElement) {
			customAnchor = target;
		}
	});
</script>

{#snippet content()}
	<div class="tmodal-title">{title}</div>
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
		<TGate bind:active={open} {selector} />
		<Popover.Trigger style="display:none;" />
		<Popover.Content
			{customAnchor}
			side={placement}
			sideOffset={offset}
			class={`z-[10002] w-80 max-w-[min(90vw,28rem)] ${selector ? '' : 'tmodal-center-panel'}`}
			align="center"
			interactOutsideBehavior="ignore"
			avoidCollisions={true}
			collisionPadding={screenMargin}
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
		<div class="tmodal-center-panel">
			{@render content()}
		</div>
	</div>
{/if}
{#if customAnchor && disableTargetInteraction}
	<div
		class="tmodal-shield"
		style={`position:fixed; left:${customAnchor.getBoundingClientRect().x}px; top:${customAnchor.getBoundingClientRect().y}px; width:${customAnchor.getBoundingClientRect().width}px; height:${customAnchor.getBoundingClientRect().height}px; z-index:10002; background:rgba(0,0,0,0);`}
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
