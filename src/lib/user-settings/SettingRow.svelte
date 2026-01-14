<script lang="ts">
	import Icon from '@iconify/svelte';

	interface Props {
		label: string;
		desc?: string;
		hint?: string | (new (...args: any) => any);
		itemId: string;
		expanded: Record<string, boolean>;
		hasActions?: boolean;
		children?: any;
	}

	const { label, desc, hint, itemId, expanded, hasActions = false, children }: Props = $props();
</script>

<div class="rounded-md border bg-white p-3">
	<div class="setting-row grid gap-3 sm:grid-cols-[minmax(220px,320px)_minmax(0,1fr)_auto]" class:has-actions={hasActions}>
		<div class="setting-label flex flex-col gap-1">
			<div class="font-medium">{label}</div>
			{#if desc}
				<p class="text-sm opacity-60">{desc}</p>
			{/if}
		</div>

		{#if hint}
			<div class="setting-hint justify-self-end">
				<button
					class="inline-flex items-center gap-2 text-sm opacity-70 hover:opacity-100"
					onclick={() => (expanded[itemId] = !expanded[itemId])}
				>
					{#if expanded[itemId]}
						<Icon icon="ri:skip-up-line" class="" />
					{:else}
						<Icon icon="material-symbols:help" class="" />
					{/if}
				</button>
			</div>
		{/if}

		{@render children?.()}
	</div>
	{#if expanded[itemId]}
		<div class="mt-2 border-t pt-1 text-sm">
			{#if typeof hint === 'function'}
				{@const HintComponent = hint}
				<HintComponent />
			{:else}
				{hint}
			{/if}
		</div>
	{/if}
</div>

<style>
	.setting-row {
		grid-template-areas:
			'label actions hint'
			'body body body';
	}

	.setting-label {
		grid-area: label;
	}
	.setting-hint {
		grid-area: hint;
	}
</style>
