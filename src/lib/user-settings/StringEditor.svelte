<script lang="ts">
	import type { StringSetting } from './types';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';

	interface Props {
		label: string;
		store: StringSetting;
	}

	const { label, store }: Props = $props();
</script>

<div class="w-full gap-2 bg-[#fff7] p-3">
	<div class="flex align-middle">
		<h2 class="content-center font-medium">{label}:</h2>

		<input
			class="flex-[2] rounded border px-2 py-1"
			type="text"
			value={$store}
			placeholder={store.placeholder}
			oninput={(e) => ($store = e.currentTarget.value)}
		/>
	</div>
	<p class="text-sm opacity-60 italic pl-3">{store.desc}</p>
</div>
