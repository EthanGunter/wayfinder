<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		open: boolean;
		dismissable?: boolean;
		className?: string;
		bgStyle?: string;
		popoverEl?: HTMLDivElement;
		onopen?: () => void;
		onclose?: () => void;
		children?: Snippet;
	}
	let {
		popoverEl = $bindable(),
		open = $bindable(),
		dismissable = true,
		className,
		bgStyle,
		onopen,
		onclose,
		children,
		...rest
	}: Props = $props();

	let backdropEl = $state<HTMLDivElement>();

	function show() {
		open = true;
		if (dismissable) {
			backdropEl?.showPopover?.();
		}
		popoverEl?.showPopover?.();
		document.addEventListener('keydown', handleKey);
		onopen?.();
	}
	function hide() {
		open = false;
		popoverEl?.hidePopover?.();
		if (dismissable) {
			backdropEl?.hidePopover?.();
		}
		document.removeEventListener('keydown', handleKey);
		onclose?.();
	}
	function handleAnimationEnd(event: AnimationEvent) {
		if (event.animationName.endsWith('-out')) {
			// fadingOut = false;
			open = false;
			popoverEl?.classList.remove('out');
			popoverEl?.hidePopover?.();
			if (dismissable) {
				backdropEl?.hidePopover?.();
			}
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

<div
	bind:this={backdropEl}
	style={bgStyle}
	popover="manual"
	class={`overlay-backdrop ${className}`}
	onclick={handleClick}
></div>
<div
	bind:this={popoverEl}
	class="overlay"
	popover="manual"
	tabindex="-1"
	onanimationend={handleAnimationEnd}
	data-dismissable={dismissable}
	{...rest}
>
	{@render children?.()}
</div>

<style lang="scss">
	.overlay {
		margin: auto;
		border: none;
		border-radius: var(--container-border-radius_1);
		overflow: hidden;
		background-color: var(--c-bg);
		overflow: visible;
		transition:
			display 0.2s allow-discrete,
			overlay 0.2s allow-discrete;
		animation: out 0.2s forwards;
		&:popover-open {
			animation: in 0.2s forwards;
		}
		// &::backdrop {
		// 	background-color: var(--c-shadow);
		// 	pointer-events: inherit !important;
		// }
	}

	.overlay-backdrop {
		position: absolute;
		// inset: 0;
		z-index: -1;
		width: 100vw;
		height: 100vh;
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
