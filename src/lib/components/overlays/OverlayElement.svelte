<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		open: boolean;
		dismissable?: boolean;
		onopen?: () => void;
		onclose?: () => void;
		children?: Snippet;
		popoverEl?: HTMLDivElement;
	}
	let {
		popoverEl = $bindable(),
		open = $bindable(),
		dismissable = true,
		onopen,
		onclose,
		children,
		...rest
	}: Props = $props();

	function show() {
		open = true;
		popoverEl?.showPopover?.();
		document.addEventListener('keydown', handleKey);
		onopen?.();
	}
	function hide() {
		open = false;
		popoverEl?.hidePopover?.();
		document.removeEventListener('keydown', handleKey);
		onclose?.();
	}
	function handleAnimationEnd(event: AnimationEvent) {
		if (event.animationName.endsWith('-out')) {
			// fadingOut = false;
			open = false;
			popoverEl?.classList.remove('out');
			popoverEl?.hidePopover?.();
		}
	}
	function handleClick(event: MouseEvent) {
		// If we click outside the popover element
		event.stopPropagation();
		const x = event.clientX;
		const y = event.clientY;
		const box = (popoverEl as HTMLElement).getBoundingClientRect();

		if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
			hide();
		}
	}
	function handleKey(event: KeyboardEvent) {
		if (dismissable && (event.key === 'Escape' || event.key === 'Esc')) {
			hide();
		}
	}

	$effect(() => {
		if (open) {
			show();
		} else {
			hide();
		}
	});
</script>

{#if open && dismissable}
	<div class="backdrop" onclick={handleClick}></div>
{/if}
<div
	bind:this={popoverEl}
	class="popover"
	popover="manual"
	tabindex="-1"
	onanimationend={handleAnimationEnd}
	data-dismissable={dismissable}
	{...rest}
>
	{@render children?.()}
</div>

<style lang="scss">
	.popover {
		margin: auto;
		background-color: var(--c-bg);
		transition:
			display 0.2s allow-discrete,
			overlay 0.2s allow-discrete;
		animation: out 0.2s forwards;
		&:popover-open {
			animation: in 0.2s forwards;
		}
	}

	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 9999;
		background-color: var(--c-shadow);
	}

	@keyframes in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
</style>
