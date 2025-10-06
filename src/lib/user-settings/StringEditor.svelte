<script lang="ts">
	import type { FormEventHandler } from 'svelte/elements';
	import type { StringSetting } from './types';
	import Button from '@/components/ui/button/button.svelte';

	interface Props {
		store: StringSetting;
	}

	const { store }: Props = $props();
	let value = $state($store);

	const oninput: FormEventHandler<HTMLInputElement> = (e) => {
		if (store.manualSave) return;
		$store = value;
	};
</script>

<div class="flex w-full items-center gap-2">
	<input
		class="flex-1 rounded border px-2 py-1 {store.errorMessage ? 'bg-red-300' : ''}"
		type="text"
		bind:value
		placeholder={store.placeholder}
		{oninput}
	/>
	{#if store.manualSave && $store != value}
		<Button variant="outline" onclick={() => ($store = value)}>✔️</Button>
	{/if}
</div>
{#if store.errorMessage}
	<p class="text-red-600">{store.errorMessage}</p>
{/if}
