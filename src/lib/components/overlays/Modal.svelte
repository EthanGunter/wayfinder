<!-- @component
// TODO This should be extracted to a `let result = await openModal("ok", "cancel");` API
 -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import OverlayElement from './OverlayElement.svelte';
	import { Button } from '../ui/button';

	interface Props {
		open: boolean;
		title?: string;
		size?: 'small' | 'medium' | 'large';
		buttons?: { label: string; action: () => void; class: 'primary' | 'secondary' }[];
		children: Snippet;
	}

	let { open = $bindable(false), title, size = 'medium', buttons = [], children }: Props = $props();

	function handleCancel() {
		open = false;
	}

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		const x = e.clientX;
		const y = e.clientY;
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();

		if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
			open = false;
		}
	}
</script>

<OverlayElement bind:open class="modal-dialog {size}" onclick={handleClick}>
	<!-- <div class="modal-content"> -->
	{#if title}
		<header class="modal-header">
			<h2 class="modal-title">{title}</h2>
			<Button class="modal-close" onclick={handleCancel} aria-label="Close modal"> × </Button>
		</header>
	{/if}

	<main class="modal-body">
		{@render children()}
	</main>

	{#if buttons.length > 0}
		<footer class="modal-footer">
			{#each buttons as button}
				<Button class={`btn btn-${button.class}`} onclick={button.action}>
					{button.label}
				</Button>
			{/each}
		</footer>
	{/if}
	<!-- </div> -->
</OverlayElement>

<style>
	:global(.modal-dialog) {
		border: none;
		border-radius: var(--container-border-radius, 0.5rem);
		padding: 0;
		background: var(--c-bg, #f9fafb);
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		max-height: 90vh;
		overflow: hidden;
		margin: auto;
		animation: modal-appear 0.2s ease-out;
	}

	.modal-dialog.small {
		width: min(400px, 90vw);
	}

	.modal-dialog.medium {
		width: min(600px, 90vw);
	}

	.modal-dialog.large {
		width: min(800px, 90vw);
	}

	.modal-content {
		background: var(--c-bg, #ffffff);
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		max-height: 90vh;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 2rem 1rem;
		border-bottom: 1px solid var(--c-border, #e5e7eb);
		background: var(--c-bg_-2, #f9fafb);
	}

	.modal-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary, #111827);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0.25rem;
		color: var(--text-secondary, #6b7280);
		border-radius: 4px;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
	}

	.modal-close:hover {
		background: var(--background-hover, #f3f4f6);
		color: var(--text-primary, #111827);
	}

	.modal-body {
		padding: 2rem;
		overflow-y: auto;
		flex: 1;
		color: var(--text-primary, #111827);
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1rem 2rem 2rem;
		border-top: 1px solid var(--border-color, #e5e7eb);
		background: var(--c-bg_-1, #f9fafb);
	}

	.btn {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 4rem;
	}

	.btn-secondary {
		background: var(--c-bg, #ffffff);
		color: var(--text-secondary, #6b7280);
		border-color: var(--border-color, #d1d5db);
	}

	.btn-secondary:hover {
		background: var(--background-hover, #f9fafb);
		border-color: var(--border-hover, #9ca3af);
	}

	.btn-primary {
		background: var(--c-primary, #3b82f6);
		color: white;
		border-color: var(--c-primary, #3b82f6);
	}

	.btn-primary:hover {
		background: var(--primary-hover, #2563eb);
		border-color: var(--primary-hover, #2563eb);
	}

	.btn:focus {
		outline: 2px solid var(--focus-color, #3b82f6);
		outline-offset: 2px;
	}

	::backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		animation: backdrop-appear 0.2s ease-out;
	}

	@keyframes modal-appear {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes backdrop-appear {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Responsive adjustments */
	@media (max-width: 640px) {
		.modal-dialog {
			width: 95vw !important;
			margin: 1rem;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.modal-footer {
			flex-direction: column-reverse;
		}

		.btn {
			width: 100%;
		}
	}
</style>
