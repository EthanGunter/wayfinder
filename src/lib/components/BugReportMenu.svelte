<script lang="ts">
	const { onReport } = $props<{ onReport?: () => void }>();

	let showModal = $state(false);
	let bugDescription = $state('');
	let userEmail = $state('');

	function handleClick() {
		if (onReport) {
			onReport();
		} else {
			showModal = true;
		}
	}

	function closeBugReport() {
		showModal = false;
		bugDescription = '';
		userEmail = '';
	}

	function submitBugReport(e: SubmitEvent) {
		e.preventDefault();

		//TODO In a real app, this would send the report to a backend service
		console.log('Bug report submitted:', {
			description: bugDescription,
			email: userEmail,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		alert('Bug report submitted! Thank you for your feedback.');
		closeBugReport();
	}

	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.bug-report-modal')) {
			closeBugReport();
		}
	}
</script>

<svelte:window onclick={handleOutsideClick} />

<button class="bug-report-menu" onclick={handleClick} aria-label="Report a bug"> 🐞 </button>

{#if showModal}
	<div class="modal-overlay">
		<div class="bug-report-modal">
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

				<div class="form-actions">
					<button type="button" onclick={closeBugReport}>Cancel</button>
					<button type="submit" disabled={!bugDescription.trim()}>Submit Report</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style lang="scss">
	.bug-report-menu {
		background: none;
		border: none;
		font-size: 1.5em;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;

		&:hover {
			background-color: rgba(255, 255, 255, 0.1);
		}
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.bug-report-modal {
		background: var(--c-bg_2);
		border-radius: var(--container-border-radius);
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);

		h3 {
			margin: 0 0 1rem 0;
			color: var(--c-text);
		}

		p {
			margin: 0 0 1.5rem 0;
			color: var(--c-text_1);
		}
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
				color: var(--c-bg_2);
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
