<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, type Snippet } from 'svelte';
	import OverlayElement from './overlays/OverlayElement.svelte';

	interface Props {
		open: boolean;
		target?: HTMLElement | string;
		onClose?: () => void;
		children?: Snippet;
	}

	let { open = $bindable(false), target, onClose, children }: Props = $props();

	let menuEl = $state<HTMLDivElement>();
	let targetEl = $state<HTMLElement>();
	$effect(() => {
		targetEl =
			typeof target === 'string' ? (document.querySelector(target) as HTMLElement) : target;
	});

	// Position state
	let left = 0;
	let top = 0;

	function clamp(val: number, min: number, max: number) {
		return Math.max(min, Math.min(max, val));
	}

	function positionMenu() {
		if (!menuEl) return;
		const rect = menuEl.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// Default: place at mouse
		let _left = 0; //pos.x;
		let _top = 0; //pos.y;

		// If overflow right, stick to right edge
		if (_left + rect.width > vw) {
			_left = vw - rect.width - 8;
		}
		// If overflow bottom, position above mouse
		if (_top + rect.height > vh) {
			_top = /* pos.y  */ -rect.height;
			if (_top < 0) _top = 8; // Clamp to top
		}

		left = clamp(_left, 8, vw - rect.width - 8);
		top = clamp(_top, 8, vh - rect.height - 8);

		menuEl.style.left = `${left}px`;
		menuEl.style.top = `${top}px`;
	}

	function handleClickOff(event: MouseEvent) {
		if (menuEl && !menuEl.contains(event.target as Node)) {
			onClose?.();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose?.();
		}
	}

	onMount(() => {
		if (open) {
			setTimeout(positionMenu, 0);
			document.addEventListener('mousedown', handleClickOff, true);
			document.addEventListener('keydown', handleKeyDown, true);
		}
	});

	$effect(() => {
		if (open) {
			setTimeout(positionMenu, 0);
			document.addEventListener('mousedown', handleClickOff, true);
			document.addEventListener('keydown', handleKeyDown, true);
		} else {
			document.removeEventListener('mousedown', handleClickOff, true);
			document.removeEventListener('keydown', handleKeyDown, true);
		}
	});

	onDestroy(() => {
		document.removeEventListener('mousedown', handleClickOff, true);
		document.removeEventListener('keydown', handleKeyDown, true);
	});
</script>

<OverlayElement
	bind:open
	bind:popoverEl={menuEl}
	tabindex={0}
	style="position: fixed; z-index: 10000; left: 0; top: 0;"
	role="menu"
>
	<div class="context-menu">
		{@render children?.()}
	</div>
</OverlayElement>

<style>
	.context-menu {
		display: flex;
		flex-direction: column;
		gap: var(--gap-min);
		min-width: 180px;
		background: var(--background-primary, #fff);
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 8px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
		padding: 0.5rem;
		outline: none;
		user-select: none;
		/* No overlay */
	}
	.context-menu:focus {
		outline: 2px solid var(--primary-color, #3b82f6);
	}
</style>
