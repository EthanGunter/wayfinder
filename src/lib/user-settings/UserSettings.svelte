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
		StringSetting,
		type AnySetting,
		type SettingsSection,
		type SettingsTab
	} from './types';
	import RangeEditor from './RangeEditor.svelte';
	import SettingRow from './SettingRow.svelte';
	import { authState } from '@/API/Auth';
	import { userHasFeature, type UserFeature } from '@/API/Auth/User';

	const tabs = Object.entries(settings).map(([tabId, tab]) => ({ tabId, tab }));
	const sectionEntries = (tab: Record<string, any>) =>
		Object.entries(tab).filter(([k]) => !k.startsWith('$')) as [string, any][];

	// track expanded state per item
	let expanded: Record<string, boolean> = $state({});

	// Section-level gating via optional $userFeature on the section object
	const userHasAccess = (section: SettingsTab | SettingsSection): boolean => {
		const feature = section.$userFeature as UserFeature | undefined;
		if (!feature) return true; // no gate
		if ($authState.status !== 'signed-in') return false;
		return userHasFeature($authState.user, feature);
	};
</script>

<Tabs.Root value={tabs[0]?.tabId ?? ''}>
	<Tabs.List>
		{#each tabs as { tabId, tab }}
			{#if userHasAccess(tab)}
				<Tabs.Trigger value={tabId}>{tab.$label}</Tabs.Trigger>
			{/if}
		{/each}
	</Tabs.List>
	{#each tabs as { tabId, tab }}
		{#if userHasAccess(tab)}
			<Tabs.Content value={tabId}>
				{#each sectionEntries(tab) as [sectionId, section]}
					{#if userHasAccess(section)}
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
					{/if}
				{/each}
			</Tabs.Content>
		{/if}
	{/each}
</Tabs.Root>
