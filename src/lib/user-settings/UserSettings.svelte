<script lang="ts">
	import { settings } from './config';
	import * as Tabs from '$lib/components/ui/tabs';
	import DictionaryEditor from './DictionaryEditor.svelte';
	import { DictSetting, StringSetting } from './types';
	import StringEditor from './StringEditor.svelte';

	const tabs = Object.entries(settings).map(([tabId, tab]) => ({ tabId, tab }));
	const sectionEntries = (tab: Record<string, unknown>) =>
		Object.entries(tab).filter(([k]) => !k.startsWith('$')) as [string, any][];
</script>

<div>
	<Tabs.Root value={tabs[0]?.tabId ?? ''}>
		<Tabs.List>
			{#each tabs as { tabId, tab }}
				<Tabs.Trigger value={tabId}>{tab.$label}</Tabs.Trigger>
			{/each}
		</Tabs.List>
		{#each tabs as { tabId, tab }}
			<Tabs.Content value={tabId}>
				{#each sectionEntries(tab) as [sectionId, section]}
					<section class="mt-4 space-y-3">
						<h2 class="text-base font-semibold">{section.$label}</h2>
						<div class="space-y-3">
							{#each Object.entries(section).filter(([k]) => !k.startsWith('$')) as [itemId, setting]}
								{#if setting instanceof StringSetting}
									<StringEditor label={setting.label} store={setting} />
								{:else if setting instanceof DictSetting}
									<DictionaryEditor label={setting.label} store={setting} />
								{/if}
							{/each}
						</div>
					</section>
				{/each}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</div>
