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
	import { authState } from '$lib/API/Auth';
	import { userHasFeature, type UserFeature } from '$domain/models/user';

	// track expanded state per item
	// TODO convert to single item
	let expanded: Record<string, boolean> = $state({});

	// Section-level gating via optional $userFeature on the section object
	const userHasAccess = (section: SettingsTab | SettingsSection): boolean => {
		const feature = section.$userFeature as UserFeature | undefined;
		if (!feature) return true; // no gate
		if ($authState.status !== 'signed-in') return false;

		return userHasFeature($authState.user, feature);
	};

	const tabs: {
		label: string;
		sectionData: {
			label: string;
			data: { id: string; setting: AnySetting }[];
		}[];
	}[] = Object.entries(settings)
		// Disable unauthorized tabs
		.filter(([label, tab]) => !label.startsWith('$') && userHasAccess(tab))
		// Parse sections
		.map(([_, tab]) => ({
			label: tab.$label,
			sectionData: Object.entries(tab)
				// Disable unauthorized sections
				.filter(([label, data]) => !label.startsWith('$') && userHasAccess(data as SettingsSection))
				// Parse individual settings
				.map(([label, sec]) => ({
					label,
					data: Object.entries(sec as SettingsSection)
						.filter(([label]) => !label.startsWith('$'))
						.map(([label, setting]) => ({
							id: label,
							setting: setting as AnySetting
						}))
				}))
		}));
</script>

{#if tabs.length > 0}
	<Tabs.Root value={tabs[0].label}>
		<Tabs.List>
			{#each tabs as { label: tabLabel }}
				<Tabs.Trigger value={tabLabel}>{tabLabel}</Tabs.Trigger>
			{/each}
		</Tabs.List>
		{#each tabs as { label: tabLabel, sectionData }}
			<Tabs.Content value={tabLabel}>
				{#each sectionData as { label, data }}
					<section class="space-y-3 p-4">
						<h2 class="text-base font-semibold">{label}</h2>
						<div class="space-y-2">
							{#each data as { id, setting }}
								<SettingRow
									label={setting.label}
									desc={setting.desc}
									hint={setting.hint}
									itemId={id}
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
{/if}
