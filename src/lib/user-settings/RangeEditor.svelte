<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import type { NumberSetting, RangeSetting } from './types';

	interface Props {
		store: RangeSetting;
	}

	const MIN = 0;
	const MIN_STEP = 0.1;
	const MAX = 1;

	const { store }: Props = $props();
</script>

<div class="flex w-full items-center gap-3">
	<input
		class="w-16 rounded border px-2 py-1"
		type="number"
		min={store.min ?? MIN}
		max={store.max ?? MAX}
		step={store.step ?? MIN_STEP}
		value={$store[0]}
		oninput={(e) => ($store = [Number(e.currentTarget.value), $store[1]])}
	/>

	<div class="flex-1">
		<Slider
			type="multiple"
			bind:value={$store}
			min={store.min ?? MIN}
			max={store.max ?? MAX}
			step={store.step ?? MIN_STEP}
		/>
	</div>

	<input
		class="w-16 rounded border px-2 py-1"
		type="number"
		min={store.min ?? MIN}
		max={store.max ?? MAX}
		step={store.step ?? MIN_STEP}
		value={$store[1]}
		oninput={(e) => ($store = [$store[0], Number(e.currentTarget.value)])}
	/>
</div>
