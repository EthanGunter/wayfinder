<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import type { LlmConnection } from '../llm-options';

	type Props = {
		item: LlmConnection;
		update: (next: LlmConnection) => void;
		remove: () => void;
	};

	const { item, update }: Props = $props();
</script>

<div class="grid grid-cols-1 gap-2">
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
		<div class="flex flex-col gap-1">
			<label class="text-xs opacity-70" for={`llm-label-${item.id}`}>Label</label>
			<Input
				id={`llm-label-${item.id}`}
				value={item.label}
				oninput={(e) => update({ ...item, label: (e.currentTarget as HTMLInputElement).value })}
				placeholder="e.g. My GPU box"
			/>
		</div>
	</div>
	<div class="flex flex-col gap-1">
		<label class="text-xs opacity-70" for={`llm-baseurl-${item.id}`}>Base URL</label>
		<Input
			id={`llm-baseurl-${item.id}`}
			value={item.baseUrl}
			oninput={(e) => update({ ...item, baseUrl: (e.currentTarget as HTMLInputElement).value })}
			placeholder="https://api.openai.com/v1"
		/>
	</div>
	<div class="flex flex-col gap-1">
		<label class="text-xs opacity-70" for={`llm-apikey-${item.id}`}>API key</label>
		<Input
			id={`llm-apikey-${item.id}`}
			type="password"
			value={item.apiKey}
			oninput={(e) => update({ ...item, apiKey: (e.currentTarget as HTMLInputElement).value })}
			placeholder="sk-…"
		/>
	</div>
</div>

