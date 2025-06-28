<script lang="ts">
	import Tooltip from './Tooltip.svelte';

	interface Props {
		id: string;
		children: any;
		image?: string;
		error?: { msg: string };
		onDelete?: (key: string) => void;
	}

	const { id, children, image, error, onDelete }: Props = $props();

	function handleDelete() {
		onDelete?.(id);
	}
</script>

{#if error}
	<Tooltip content={error.msg} position="top">
		<div class="text-bubble error">
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
		</div>
	</Tooltip>
{:else}
	<div class="text-bubble">
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
	</div>
{/if}

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
</style>