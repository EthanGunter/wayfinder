<script lang="ts">
	import type { DictSetting } from './settings';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';

	interface Props {
		label: string;
		store: DictSetting;
	}

	const { label, store }: Props = $props();

	type Row = { id: string; key: string; value: string; conflict?: boolean };
	let rows = $state<Row[]>([]);

	onMount(() => {
		const existingIdByKey = new Map(rows.map((r) => [r.key, r.id] as const));
		rows = Object.entries(($store as Record<string, string>) ?? {}).map(([k, v]) => ({
			id: existingIdByKey.get(k) ?? crypto.randomUUID(),
			key: k,
			value: v
		}));
		markConflicts();
	});

	function ensureUniqueBase(base: string): string {
		const keys = new Set(rows.map((r) => r.key));
		if (!keys.has(base)) return base;
		let i = 1;
		let candidate = `${base}_${i}`;
		while (keys.has(candidate)) {
			i++;
			candidate = `${base}_${i}`;
		}
		return candidate;
	}

	function writeStoreIfClean() {
		const hasConflict = rows.some((r) => r.conflict);
		if (hasConflict) return;
		const obj: Record<string, string> = {};
		for (const r of rows) obj[r.key] = r.value;
		$store = obj;
	}

	function markConflicts() {
		const counts = new Map<string, number>();
		for (const r of rows) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
		rows = rows.map((r) => ({ ...r, conflict: !r.key || (counts.get(r.key) ?? 0) > 1 }));
	}

	function addRow() {
		const key = ensureUniqueBase('KEY');
		rows = [...rows, { id: crypto.randomUUID(), key, value: 'VALUE' }];
		markConflicts();
		writeStoreIfClean();
	}

	function updateKeyById(id: string, newKey: string) {
		rows = rows.map((r) => (r.id === id ? { ...r, key: newKey } : r));
		markConflicts();
		writeStoreIfClean();
	}

	function updateValueById(id: string, value: string) {
		rows = rows.map((r) => (r.id === id ? { ...r, value } : r));
		markConflicts();
		writeStoreIfClean();
	}

	function removeRow(id: string) {
		rows = rows.filter((r) => r.id !== id);
		markConflicts();
		writeStoreIfClean();
	}
</script>

<div class="w-full">
	<div class="flex items-center justify-between p-5">
		<h2 class="text-sm font-medium">{label}</h2>
		<Button size="sm" onclick={addRow}>+</Button>
	</div>
	<div class="flex flex-col gap-2 bg-[#0001] p-3">
		{#each rows as r (r.id)}
			<div class="flex items-center gap-2">
				<input
					class="flex-1 rounded border px-2 py-1 text-sm {r.conflict
						? 'border-red-500 bg-red-50'
						: ''}"
					type="text"
					value={r.key}
					oninput={(e) => updateKeyById(r.id, (e.target as HTMLInputElement).value)}
				/>
				<input
					class="flex-[2] rounded border px-2 py-1 text-sm"
					type="text"
					value={r.value}
					oninput={(e) => updateValueById(r.id, (e.target as HTMLInputElement).value)}
				/>
				<Button size="sm" onclick={() => removeRow(r.id)}>-</Button>
			</div>
		{/each}
	</div>
</div>
