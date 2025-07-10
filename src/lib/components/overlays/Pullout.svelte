<script lang="ts">
	import { mount, onMount, type Snippet } from 'svelte';
	interface Props {
		open: boolean; // Whether the menu is open
		placement: 'left' | 'right' | 'top' | 'bottom';
		children: Snippet;
	}
	let {
		open = $bindable(false), // Whether the menu is open
		placement = 'left', // 'left', 'right', 'top', 'bottom'
		children
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement>();
	function handleClick(e: MouseEvent) {
		e.stopPropagation();

		const x = e.clientX;
		const y = e.clientY;
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();

		if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
			open = false;
			dialogEl?.close();
		}
	}
	$effect(() => {
		if (open) {
			dialogEl?.showModal();
		} else {
			dialogEl?.close();
		}
	});
</script>

<dialog bind:this={dialogEl} onclick={handleClick} class="placement-{placement}">
	{@render children()}
</dialog>

<style>
	dialog {
		transition:
			display 0.2s allow-discrete,
			overlay 0.2s allow-discrete;
		background: var(--c-bg, #fff);
		border: 1px solid var(--c-border, #ccc);
		box-shadow: 0 0 2rem 0 var(--c-shadow, #0002);
		padding: 1rem;
		overflow-y: auto;
	}
	.pullout-menu::backdrop {
		background: var(--c-shadow, #0002);
	}

	.placement-left,
	.placement-right {
		height: 100vh;
		width: fit-content;
		max-height: 100vh;
		max-width: 94vw;
	}

	.placement-top,
	.placement-bottom {
		height: fit-content;
		width: 100vw;
		max-height: 94vh;
		max-width: 100vw;
	}

	.placement-left {
		margin-right: auto;
		border-radius: 0 var(--container-border-radius, 1rem) var(--container-border-radius, 1rem) 0;
		animation: close-left 0.2s forwards;
	}
	.placement-left[open] {
		animation: open-left 0.2s forwards;
	}
	.placement-right {
		margin-left: auto;
		border-radius: var(--container-border-radius, 1rem) 0 0 var(--container-border-radius, 1rem);
		animation: close-right 0.2s forwards;
	}
	.placement-right[open] {
		animation: open-right 0.2s forwards;
	}
	.placement-top {
		margin-bottom: auto;
		border-radius: 0 0 var(--container-border-radius, 1rem) var(--container-border-radius, 1rem);
		animation: close-top 0.2s forwards;
	}
	.placement-top[open] {
		animation: open-top 0.2s forwards;
	}
	.placement-bottom {
		margin-top: auto;
		border-radius: var(--container-border-radius, 1rem) var(--container-border-radius, 1rem) 0 0;
		animation: close-bottom 0.2s forwards;
	}
	.placement-bottom[open] {
		animation: open-bottom 0.2s forwards;
	}

	@keyframes open-left {
		from {
			transform: translateX(-100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	@keyframes close-left {
		from {
			transform: translateX(0);
			opacity: 1;
		}
		to {
			transform: translateX(-100%);
			opacity: 0;
		}
	}
	@keyframes open-right {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}
	@keyframes close-right {
		from {
			transform: translateX(0);
			opacity: 1;
		}
		to {
			transform: translateX(100%);
			opacity: 0;
		}
	}
	@keyframes open-top {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	@keyframes close-top {
		from {
			transform: translateY(0);
			opacity: 1;
		}
		to {
			transform: translateY(-100%);
			opacity: 0;
		}
	}
	@keyframes open-bottom {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
	@keyframes close-bottom {
		from {
			transform: translateY(0);
			opacity: 1;
		}
		to {
			transform: translateY(100%);
			opacity: 0;
		}
	}
</style>
