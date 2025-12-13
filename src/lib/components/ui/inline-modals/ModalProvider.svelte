<script lang="ts">
	import { derived } from 'svelte/store';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		modalState,
		_closeCurrentModal,
		_resolveCurrentModal,
		_rejectCurrentModal
	} from './state';

	const state = modalState;
	const show = derived(state, ($s) => $s.open);
</script>

<Dialog.Root
	open={$show}
	onOpenChange={(open) => {
		if (!open) _closeCurrentModal();
	}}
>
	<Dialog.Content>
		{#if $state.descriptor}
			{@const descriptor = $state.descriptor}
			{@render descriptor.snippet({
				resolve: _resolveCurrentModal,
				reject: _rejectCurrentModal,
				options: descriptor.options
			})}
		{/if}
	</Dialog.Content>
</Dialog.Root>
