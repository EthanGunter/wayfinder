<script lang="ts">
	import { settings } from './schema';
	import * as Tabs from '$lib/components/ui/tabs';
	import DictionaryEditor from './Editors/DictionaryEditor.svelte';
	import StringEditor from './Editors/StringEditor.svelte';
	import BoolEditor from './Editors/BoolEditor.svelte';
	import NumberEditor from './Editors/NumberEditor.svelte';
	import EnumEditor from './Editors/EnumEditor.svelte';
	import MultiEnumEditor from './Editors/MultiEnumEditor.svelte';
	import ArrayEditor from './Editors/ArrayEditor.svelte';
	import {
		BoolSetting,
		DictSetting,
		EnumSetting,
		MultiEnumSetting,
		NumberSetting,
		RangeSetting,
		StringSetting,
		ArraySetting,
		type AnySetting,
		type SettingsSection,
		type SettingsTab
	} from './types';
	import { KeybindSetting } from './keybind';
	import RangeEditor from './Editors/RangeEditor.svelte';
	import KeybindEditor from './Editors/KeybindEditor.svelte';
	import SettingRow from './SettingRow.svelte';
	import { type UserFeature } from '$domain/models/user';
	import { hasFeature } from '$lib/API/Auth';

	// track expanded state per item
	// TODO convert to single item
	let expanded: Record<string, boolean> = $state({});

	// Standard pattern: create reactive feature stores for gating
	const hasDev = hasFeature('dev');

	// Helper to check feature access
	// Only used to hide tabs and sections, not to gate settings
	const checkFeature = (feature: UserFeature | undefined): boolean => {
		if (!feature) return true;
		// Access stores directly by name for Svelte reactivity
		if (feature === 'dev') return $hasDev;
		return false;
	};

	const tabs: {
		label: string;
		sectionData: {
			label: string;
			data: { id: string; setting: AnySetting }[];
		}[];
	}[] = $derived(
		Object.entries(settings)
			// Disable unauthorized tabs
			.filter(([label, tab]) => {
				if (label.startsWith('$')) return false;
				if ('$userFeature' in tab) return checkFeature(tab.$userFeature as UserFeature | undefined);
				else return true;
			})
			// Parse sections
			.map(([_, tab]) => ({
				label: tab.$label,
				sectionData: Object.entries(tab)
					// Disable unauthorized sections
					.filter(([label, data]) => {
						if (label.startsWith('$')) return false;
						return checkFeature((data as SettingsSection).$userFeature as UserFeature | undefined);
					})
					// Parse individual settings
					.map(([label, sec]) => ({
						label: (sec as SettingsSection).$label,
						data: Object.entries(sec as SettingsSection)
							.filter(([label]) => !label.startsWith('$'))
							.map(([label, setting]) => ({
								id: label,
								setting: setting as AnySetting
							}))
					}))
			}))
	);
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
									hasActions={setting instanceof ArraySetting}
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
										<EnumEditor store={setting} />
									{:else if setting instanceof MultiEnumSetting}
										<MultiEnumEditor store={setting} />
									{:else if setting instanceof ArraySetting}
										<ArrayEditor store={setting} />
									{:else if setting instanceof DictSetting}
										<DictionaryEditor store={setting} />
									{:else if setting instanceof KeybindSetting}
										<KeybindEditor store={setting} />
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
