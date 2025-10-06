<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import type { NumberSetting } from './types';

	interface Props {
		store: NumberSetting;
	}

	const MIN = 0;
	const MIN_STEP = 0.1;
	const MAX = 1;

	const { store }: Props = $props();

	const hasRange = store.min !== undefined && store.max !== undefined;
</script>

<div class="flex w-full items-center gap-3">
	<input
		class="w-16 rounded border px-2 py-1"
		type="number"
		min={store.min ?? MIN}
		max={store.max ?? MAX}
		step={store.step ?? MIN_STEP}
		bind:value={$store}
	/>
	{#if hasRange}
		<div class="flex-1">
			<Slider
				type="single"
				bind:value={$store}
				min={store.min ?? MIN}
				max={store.max ?? MAX}
				step={store.step ?? MIN_STEP}
			/>
		</div>
	{/if}
</div>
