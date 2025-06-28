<script lang="ts">
	interface Props {
		id: string;
		children: any;
		image?: string;
		error?: { msg: string };
		onDelete?: (key: string) => void;
	}

	const { id, children, image, error, onDelete }: Props = $props();

	let showTooltip = $state(false);

	function handleDelete() {
		onDelete?.(id);
	}

	function showErrorTooltip() {
		if (error) {
			showTooltip = true;
		}
	}

	function hideErrorTooltip() {
		showTooltip = false;
	}
</script>

<div 
	class="text-bubble" 
	class:error={!!error}
	onmouseenter={showErrorTooltip}
	onmouseleave={hideErrorTooltip}
	title={error?.msg}
>
	{#if image}
		<img src={image} alt="" />
	{/if}
	<span class="text">
		{@render children?.()}
	</span>
	{#if onDelete}
		<button class="remove-icon" onclick={handleDelete} aria-label="Remove {id}">
			<!-- Using × symbol as clear icon -->
			×
		</button>
	{/if}
	
	{#if error && showTooltip}
		<div class="error-tooltip">
			{error.msg}
		</div>
	{/if}
</div>

<style lang="scss">
	.text-bubble {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem;
		padding-right: 0.4rem;
		height: min-content;

		border-radius: 50rem;
		border: 1px solid var(--c-border);

		&:hover {
			background-color: rgba(255, 255, 255, 0.1);
			// border: 1px solid rgba(0, 0, 0, 0.3);
		}

		img {
			width: 1.5rem;
			border-radius: 50%;
		}

		.remove-icon {
			cursor: pointer;
			width: 1.2rem;
			height: 1.2rem;
			border: none;
			background: none;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			font-size: 1.2rem;
			line-height: 1;

			> * {
				width: 100%;
				height: 100%;
			}
		}
	}

	.error {
		background-color: rgb(255, 0, 0, 0.2);

		&:hover {
			background-color: rgb(255, 0, 0, 0.2);
		}
	}

	.error-tooltip {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		background: var(--c-neg);
		color: var(--c-bg_2);
		padding: 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.8rem;
		white-space: nowrap;
		z-index: 1000;
		margin-top: 0.25rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

		&::before {
			content: '';
			position: absolute;
			bottom: 100%;
			left: 50%;
			transform: translateX(-50%);
			border: 4px solid transparent;
			border-bottom-color: var(--c-neg);
		}
	}

	.text-bubble {
		position: relative;
	}
</style>