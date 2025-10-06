<script lang="ts">
	import { settings } from './schema';
	import * as Tabs from '$lib/components/ui/tabs';
	import DictionaryEditor from './DictionaryEditor.svelte';
	import StringEditor from './StringEditor.svelte';
	import BoolEditor from './BoolEditor.svelte';
	import NumberEditor from './NumberEditor.svelte';
	import EnumEditor from './EnumEditor.svelte';
	import {
		BoolSetting,
		DictSetting,
		EnumSetting,
		NumberSetting,
		RangeSetting,
		StringSetting
	} from './types';
	import RangeEditor from './RangeEditor.svelte';
	import SettingRow from './SettingRow.svelte';

	const tabs = Object.entries(settings).map(([tabId, tab]) => ({ tabId, tab }));
	const sectionEntries = (tab: Record<string, unknown>) =>
		Object.entries(tab).filter(([k]) => !k.startsWith('$')) as [string, any][];

	// track expanded state per item
	let expanded: Record<string, boolean> = $state({});
</script>

<Tabs.Root value={tabs[0]?.tabId ?? ''}>
	<Tabs.List>
		{#each tabs as { tabId, tab }}
			<Tabs.Trigger value={tabId}>{tab.$label}</Tabs.Trigger>
		{/each}
	</Tabs.List>
	{#each tabs as { tabId, tab }}
		<Tabs.Content value={tabId}>
			{#each sectionEntries(tab) as [sectionId, section]}
				<section class="space-y-3 p-4">
					<h2 class="text-base font-semibold">{section.$label}</h2>
					<div class="space-y-2">
						{#each Object.entries(section).filter(([k]) => !k.startsWith('$')) as [itemId, setting]}
							<SettingRow
								label={(setting as any).label}
								desc={(setting as any).desc}
								hint={(setting as any).hint}
								{itemId}
								{expanded}
							>
								{#if setting instanceof StringSetting}
									<StringEditor store={setting} />
								{:else if setting instanceof BoolSetting}
									<BoolEditor store={setting} />
								{:else if setting instanceof NumberSetting}
									<NumberEditor store={setting} />
								{:else if setting instanceof RangeSetting}
									<RangeEditor store={setting} />
								{:else if setting instanceof EnumSetting}
									<EnumEditor store={setting as any} />
								{:else if setting instanceof DictSetting}
									<DictionaryEditor store={setting} />
								{/if}
							</SettingRow>
						{/each}
					</div>
				</section>
			{/each}
		</Tabs.Content>
	{/each}
</Tabs.Root>
