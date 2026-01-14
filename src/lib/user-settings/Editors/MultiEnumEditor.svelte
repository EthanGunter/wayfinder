<script lang="ts">
	import type { MultiEnumSetting } from '../types';
	import { Checkbox } from '$lib/components/ui/checkbox';

	interface Props<T extends string | number> {
		store: MultiEnumSetting<T>;
	}

	const { store }: Props<string | number> = $props();

	type Option = (typeof store.options)[number];
	type Subgroup = { name: string; options: Option[] };
	type Group = { name: string; subgroups: Subgroup[] };

	let options = $state<Option[]>(store.options);
	
	$effect(() => {
		const unsubscribe = store.optionsStore.subscribe(value => {
			options = value;
		});
		return unsubscribe;
	});

	const groups: Group[] = $derived(
		(() => {
			const byGroup = new Map<string, Map<string, Option[]>>();
			for (const opt of options) {
				const groupName = opt.group ?? '';
				const subgroupName = opt.subgroup ?? '';

				const subgroupMap = byGroup.get(groupName) ?? new Map<string, Option[]>();
				const arr = subgroupMap.get(subgroupName) ?? [];
				arr.push(opt);
				subgroupMap.set(subgroupName, arr);
				byGroup.set(groupName, subgroupMap);
			}
			return Array.from(byGroup.entries()).map(([name, subMap]) => ({
				name,
				subgroups: Array.from(subMap.entries()).map(([subName, options]) => ({
					name: subName,
					options
				}))
			}));
		})()
	);

	const enabledSet = $derived(new Set($store));

	function toggle(value: string | number) {
		const current = $store;
		if (current.includes(value)) {
			$store = current.filter((v) => v !== value);
		} else {
			$store = [...current, value];
		}
	}
</script>

<div style="grid-area: body" class="min-w-0 flex flex-col gap-3">
	{#each groups as { name, subgroups } (name)}
		<div class="flex flex-col gap-2">
			{#if name}
				<div class="text-xs font-medium uppercase tracking-wide opacity-50">{name}</div>
			{/if}

			{#each subgroups as sg (sg.name)}
				<div class="flex flex-col gap-1.5">
					{#if sg.name}
						<div class="text-sm font-medium capitalize opacity-70">{sg.name}</div>
					{/if}

					<div class="flex flex-col gap-1">
						{#each sg.options as opt (String(opt.value))}
							<label class="flex items-center gap-2 cursor-pointer hover:opacity-80">
								<Checkbox
									checked={enabledSet.has(opt.value)}
									onCheckedChange={() => toggle(opt.value)}
								/>
								<span class="text-sm">{opt.label}</span>
							</label>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/each}
</div>
