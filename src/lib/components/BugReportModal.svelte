<script lang="ts">
	import type { Snippet } from 'svelte';
	import Modal from '$lib/components/overlays/Modal.svelte';
	interface Props {
		onSubmit?: () => void;
		children: Snippet;
	}
	const { children, onSubmit }: Props = $props();

	let showModal = $state(false);
	let bugDescription = $state('');
	let userEmail = $state('');

	function closeBugReport() {
		showModal = false;
		bugDescription = '';
		userEmail = '';
	}

	function submitBugReport() {
		//TODO In a real app, this would send the report to a backend service
		console.log('Bug report submitted:', {
			description: bugDescription,
			email: userEmail,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		alert('Bug report submitted! Thank you for your feedback.');
		onSubmit?.();
		closeBugReport();
	}
</script>

<button class="bug-report-menu" onclick={() => (showModal = true)} aria-label="Report a bug">
	{@render children()}
</button>

<Modal
	bind:open={showModal}
	buttons={[
		{ label: 'Submit', action: submitBugReport, class: 'primary' },
		{ label: 'Cancel', action: closeBugReport, class: 'secondary' }
	]}
>
	<h3>Report a Bug</h3>
	<p>Help us improve by describing the issue you encountered:</p>

	<form onsubmit={submitBugReport}>
		<div class="form-group">
			<label for="bug-description">Description *</label>
			<textarea
				id="bug-description"
				bind:value={bugDescription}
				placeholder="Please describe what happened, what you expected, and steps to reproduce..."
				required
				rows="4"
			></textarea>
		</div>

		<div class="form-group">
			<label for="user-email">Email (optional)</label>
			<input
				id="user-email"
				type="email"
				bind:value={userEmail}
				placeholder="your.email@example.com"
			/>
			<small>We'll only use this to follow up on your report</small>
		</div>
	</form>
</Modal>

<style lang="scss">
	.bug-report-menu {
		// background: none;
		border: none;
		font-size: 1.5em;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;

		&:hover {
			// background-color: rgba(255, 255, 255, 0.1);
		}
	}

	h3 {
		margin: 0 0 1rem 0;
		color: var(--c-text);
	}

	p {
		margin: 0 0 1.5rem 0;
		color: var(--c-text_1);
	}

	.form-group {
		margin-bottom: 1.5rem;

		label {
			display: block;
			margin-bottom: 0.5rem;
			font-weight: 500;
			color: var(--c-text);
		}

		textarea,
		input {
			width: 100%;
			padding: var(--interactible-padding);
			border: 1px solid var(--c-border);
			border-radius: var(--interactible-border-radius);
			background: var(--input-bg);
			color: var(--c-text);
			font-family: inherit;

			&:focus {
				outline: none;
				border-color: var(--c-primary);
				box-shadow: 0 0 0 2px rgba(25, 155, 230, 0.2);
			}
		}

		textarea {
			resize: vertical;
			min-height: 100px;
		}

		small {
			display: block;
			margin-top: 0.25rem;
			color: var(--c-text_2);
			font-size: 0.85rem;
		}
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 2rem;

		button {
			padding: 0.75rem 1.5rem;
			border: 1px solid var(--c-border);
			border-radius: var(--interactible-border-radius);
			cursor: pointer;
			font-size: 0.9rem;

			&[type='button'] {
				background: var(--c-bg_1);
				color: var(--c-text);

				&:hover {
					background: var(--c-bg);
				}
			}

			&[type='submit'] {
				background: var(--c-primary);
				color: var(--c-bg);
				border-color: var(--c-primary);

				&:hover:not(:disabled) {
					background: var(--c-primary_-1);
					border-color: var(--c-primary_-1);
				}

				&:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
			}
		}
	}
</style>
