<script lang="ts">
	import { Button } from './ui/button';
	import * as Tooltip from './ui/tooltip';
	interface Props {
		id: string;
		children: any;
		image?: string;
		error?: { msg: string };
		onDelete?: (key: string) => void;
	}

	const { id, children, image, error, onDelete }: Props = $props();
	let bubble = $state<HTMLDivElement>();
	function handleDelete() {
		onDelete?.(id);
	}
</script>

{#if error}
	<Tooltip.Root>
		<Tooltip.Trigger>
			<div bind:this={bubble} class="flex flex-row items-center gap-2 p-1 pr-2 h-min rounded-full border border-gray-400 bg-red-200 hover:bg-red-300">
				{#if image}
					<img src={image} alt="" class="w-6 rounded-full" />
				{/if}
				<span class="text">
					{@render children?.()}
				</span>
				{#if onDelete}
					<Button class="cursor-pointer w-5 h-5 border-none bg-transparent flex items-center justify-center rounded-full text-xl leading-none" onclick={handleDelete} aria-label="Remove {id}">
						<!-- Using × symbol as clear icon -->
						×
					</Button>
				{/if}
			</div>
		</Tooltip.Trigger>
		<Tooltip.Content side="top" class="bg-red-50 text-red-800 border border-red-200">
			{error.msg}
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	<div class="flex flex-row items-center gap-2 p-1 pr-2 h-min rounded-full border border-gray-400 hover:bg-white/10">
		{#if image}
			<img src={image} alt="" class="w-6 rounded-full" />
		{/if}
		<span class="text">
			{@render children?.()}
		</span>
		{#if onDelete}
			<Button class="cursor-pointer w-5 h-5 border-none bg-transparent flex items-center justify-center rounded-full text-xl leading-none" onclick={handleDelete} aria-label="Remove {id}">
				<!-- Using × symbol as clear icon -->
				×
			</Button>
		{/if}
	</div>
{/if}
