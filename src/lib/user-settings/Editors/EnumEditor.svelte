<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import type { EnumSetting } from '../types';

	interface Props<T extends string | number> {
		store: EnumSetting<T>;
	}

	const { store }: Props<string | number> = $props();

	// Local collapsing state by group name (optional UX polish)
	let collapsed: Record<string, boolean> = $state({});

	const valueStr = $derived(String($store));
	
	type Option = (typeof store.options)[number];
	let options = $state<Option[]>(store.options);
	
	$effect(() => {
		const unsubscribe = store.optionsStore.subscribe(value => {
			options = value;
		});
		return unsubscribe;
	});

	const selectedOpt = $derived(options.find((o) => String(o.value) === valueStr));
	const display = $derived(selectedOpt?.label ?? valueStr);

	type Subsubgroup = { name: string; options: Option[] };
	type Subgroup = { name: string; subsubgroups: Subsubgroup[] };
	type Group = { name: string; subgroups: Subgroup[] };

	const groups: Group[] = $derived(
		(() => {
			const byGroup = new Map<string, Map<string, Map<string, Option[]>>>();
			for (const opt of options) {
				const groupName = opt.group ?? '';
				const subgroupName = opt.subgroup ?? '';
				const subsubName = opt.subsubgroup ?? '';

				const subgroupMap = byGroup.get(groupName) ?? new Map<string, Map<string, Option[]>>();
				const subsubMap = subgroupMap.get(subgroupName) ?? new Map<string, Option[]>();
				const arr = subsubMap.get(subsubName) ?? [];
				arr.push(opt);
				subsubMap.set(subsubName, arr);
				subgroupMap.set(subgroupName, subsubMap);
				byGroup.set(groupName, subgroupMap);
			}
			return Array.from(byGroup.entries()).map(([name, subMap]) => ({
				name,
				subgroups: Array.from(subMap.entries()).map(([subName, subsubMap]) => ({
					name: subName,
					subsubgroups: Array.from(subsubMap.entries()).map(([subsubName, options]) => ({
						name: subsubName,
						options
					}))
				}))
			}));
		})()
	);

	const items: Array<{ value: string; label: string }> = $derived(
		options.map((o) => ({ value: String(o.value), label: o.label }))
	);

	function handleValueChange(next: string) {
		const opt = options.find((o) => String(o.value) === next);
		if (!opt) return;
		$store = opt.value;
	}
</script>

<div style="grid-area: body" class="min-w-0">
	<Select.Root type="single" value={valueStr} onValueChange={handleValueChange} items={items}>
		<Select.Trigger>
			<span>{display}</span>
		</Select.Trigger>
		<Select.Content>
		{#each groups as { name, subgroups } (name)}
			<Select.Group>
				{#if name}
					<Select.GroupHeading>
						<span>{name}</span>
					</Select.GroupHeading>
				{/if}

				{#each subgroups as sg (sg.name)}
					{@const key = name ? `${name}/${sg.name}` : sg.name}
					{#if sg.name}
						<Select.GroupHeading>
							<button
								type="button"
								class="flex w-full items-center justify-between"
								onclick={() => (collapsed[key] = !collapsed[key])}
							>
								<span class="capitalize">{sg.name}</span>
								<span class="opacity-60">{collapsed[key] ? '▸' : '▾'}</span>
							</button>
						</Select.GroupHeading>
					{/if}

					{#if !collapsed[key]}
						{#each sg.subsubgroups as ssg (ssg.name)}
							{@const subKey = ssg.name ? `${key}/${ssg.name}` : key}
							{#if ssg.name}
								<Select.GroupHeading>
									<button
										type="button"
										class="flex w-full items-center justify-between pl-2"
										onclick={() => (collapsed[subKey] = !collapsed[subKey])}
									>
										<span class="opacity-70">{ssg.name}</span>
										<span class="opacity-60">{collapsed[subKey] ? '▸' : '▾'}</span>
									</button>
								</Select.GroupHeading>
							{/if}

							{#if !collapsed[subKey]}
								{#each ssg.options as opt (String(opt.value))}
									<Select.Item value={String(opt.value)} label={opt.label} />
								{/each}
							{/if}
						{/each}
					{/if}
				{/each}
			</Select.Group>
		{/each}
	</Select.Content>
</Select.Root>
</div>
