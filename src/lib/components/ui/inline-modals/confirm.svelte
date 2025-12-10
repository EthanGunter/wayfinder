<script lang="ts" module>
	type ConfirmOptions = {
		title?: string | Snippet;
		body?: string | Snippet;
		confirmText?: string | Snippet;
		cancelText?: string | Snippet;
		destructive?: boolean;
	};

	export function confirm(options: ConfirmOptions): Promise<boolean> {
		return showCustomModal<ConfirmOptions, boolean>({
			id: 'confirm',
			options,
			snippet: confirmSnippet
		});
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '../button'; // adjust path as needed
	import { showCustomModal, type ModalSnippetArgs } from './state';
</script>

{#snippet confirmSnippet({ resolve, options }: ModalSnippetArgs<boolean, ConfirmOptions>)}
	<Dialog.Header>
		{#if typeof options.title === 'function'}
			{@render options.title()}
		{:else}
			<Dialog.Title>{options.title ?? 'Confirm'}</Dialog.Title>
		{/if}
	</Dialog.Header>

	{#if options.body}
		{#if typeof options.body === 'function'}
			{@render options.body()}
		{:else}
			<Dialog.Description>
				{options.body}
			</Dialog.Description>
		{/if}
	{/if}

	<Dialog.Footer class="flex gap-2">
		<Button variant="outline" onclick={() => resolve(false)}>
			{#if typeof options.cancelText === 'function'}
				{@render options.cancelText()}
			{:else}
				{options.cancelText ?? 'Cancel'}
			{/if}
		</Button>
		<Button variant={options.destructive ? 'destructive' : 'default'} onclick={() => resolve(true)}>
			{#if typeof options.confirmText === 'function'}
				{@render options.confirmText()}
			{:else}
				{options.confirmText ?? 'OK'}
			{/if}
		</Button>
	</Dialog.Footer>
{/snippet}
