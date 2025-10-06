<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import type { EnumSetting } from './types';

	interface Props<T extends number> {
		store: EnumSetting<T>;
	}

	const { store }: Props<any> = $props();
	const numberBacked = typeof store.options[0].value === 'number';
	console.log($store);

	const display = $derived(
		numberBacked
			? (store.options.find((i) => i.value === $store)?.label ?? 'error')
			: (store.options.find((i) => i.label === $store)?.label ?? String($store))
	);
</script>

<Select.Root type="single" bind:value={$store as unknown as string} items={store.options}>
	<Select.Trigger>
		<span>{display}</span>
	</Select.Trigger>
	<Select.Content>
		{#each store.options as opt}
			<Select.Item value={opt.value}>
				<span>{numberBacked ? opt.label : opt.value}</span>
			</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
