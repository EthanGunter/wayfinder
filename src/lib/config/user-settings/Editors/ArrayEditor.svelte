<script lang="ts">
	import type { ArraySetting } from '../types';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';

	type Props = {
		store: ArraySetting<unknown>;
	};

	const { store }: Props = $props();

	function updateAt(index: number, next: unknown) {
		store.update((arr) => arr.map((v, i) => (i === index ? next : v)));
	}

	function removeAt(index: number) {
		store.update((arr) => arr.filter((_, i) => i !== index));
	}

	function add() {
		store.update((arr) => [...arr, store.newItem()]);
	}

	const ItemEditor = store.itemEditor;
</script>

<div style="grid-area: actions" class="justify-self-end">
	<Button size="sm" onclick={add} aria-label={`Add ${store.label}`}>
		<Icon icon="lucide:plus" />
	</Button>
</div>

<div style="grid-area: body" class="min-w-0 flex flex-col gap-3">
	{#each $store as item, i (store.getKey ? store.getKey(item, i) : i)}
		<div class="rounded border p-2">
			<div class="flex items-start gap-2">
				<div class="flex-1">
					<ItemEditor item={item} update={(next: unknown) => updateAt(i, next)} remove={() => removeAt(i)} />
				</div>
				<Button size="sm" variant="outline" onclick={() => removeAt(i)} aria-label="Remove">
					<Icon icon="lucide:trash-2" />
				</Button>
			</div>
		</div>
	{/each}
</div>
