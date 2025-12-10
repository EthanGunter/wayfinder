<script lang="ts">
	import type { Task } from '$domain/models/task';
	import { type ModalSnippetArgs } from '../state';
	import * as Dialog from '$lib/components/ui/dialog';
	import TaskSearchBar from '../../task-searchbar/TaskSearchBar.svelte';
	import { Button } from '../../button';
	import type { SelectTaskOptions } from './SelectTask.svelte';

	const { resolve, reject, options }: ModalSnippetArgs<Task, SelectTaskOptions> = $props();
	let selectedTask = $state<Task | null>(null);
</script>

<Dialog.Header>
	{#if typeof options.title === 'function'}
		{@render options.title()}
	{:else}
		<Dialog.Title>{options.title ?? 'Select Task'}</Dialog.Title>
	{/if}
</Dialog.Header>

<Dialog.Description>
	<div class="flex w-full justify-center pb-2">
		{#if selectedTask}
			<code>{selectedTask.data.title}</code>
		{/if}
	</div>
	<TaskSearchBar onTaskSelected={(t) => (selectedTask = t)} />
</Dialog.Description>

<Dialog.Footer class="flex gap-2">
	<Button
		variant={options.destructive ? 'destructive' : 'default'}
		onclick={() => reject('User cancelled')}
	>
		{#if typeof options.cancelText === 'function'}
			{@render options.cancelText()}
		{:else}
			{options.cancelText ?? 'Cancel'}
		{/if}
	</Button>
	<Button variant="outline" disabled={!selectedTask} onclick={() => resolve(selectedTask!)}>
		{#if typeof options.confirmText === 'function'}
			{@render options.confirmText()}
		{:else}
			{options.confirmText ?? 'OK'}
		{/if}
	</Button>
</Dialog.Footer>
