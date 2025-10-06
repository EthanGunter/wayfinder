<script lang="ts">
	import Icon from '@iconify/svelte';

	interface Props {
		label: string;
		desc?: string;
		hint?: string | (new (...args: any) => any);
		itemId: string;
		expanded: Record<string, boolean>;
		children?: any;
	}

	const { label, desc, hint, itemId, expanded, children }: Props = $props();
</script>

<div class="rounded-md border bg-white p-3">
	<div class="flex gap-2">
		<div class="flex flex-col gap-1">
			<div class="font-medium">{label}</div>
			{#if desc}
				<p class="text-sm opacity-60">{desc}</p>
			{/if}
		</div>
		<div class="mx-2 flex flex-1 items-center gap-2">
			{@render children?.()}
		</div>
		{#if hint}
			<div class="mt-2 pt-2">
				<button
					class="inline-flex items-center gap-2 text-sm opacity-70 hover:opacity-100"
					onclick={() => (expanded[itemId] = !expanded[itemId])}
				>
					{#if expanded[itemId]}
						<Icon icon="ri:skip-up-line" class="size-4" />
					{:else}
						<Icon icon="material-symbols:help" class="size-4" />
					{/if}
				</button>
			</div>
		{/if}
	</div>
	{#if expanded[itemId]}
		<div class="mt-2 pt-1 text-sm border-t">
			{#if typeof hint === 'function'}
				{@const HintComponent = hint}
				<HintComponent />
			{:else}
				{hint}
			{/if}
		</div>
	{/if}
</div>
