<script lang="ts">
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';
	import tasksAPI from '$lib/API/Tasks';
	import { Button } from '$lib/components/ui/button';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Icon from '@iconify/svelte';

	interface Props {
		task: Task;
		onSelect?: () => void;
		onLocateTask?: (task: Task) => void;
	}

	let { task, onSelect, onLocateTask }: Props = $props();
	let completed = $derived(isTaskCompleted(task));

	function handleItemClick(e: MouseEvent) {
		// Don't trigger selection if clicking on checkbox or its interactive elements
		const target = e.target as HTMLElement;
		if (
			target.closest('[role="checkbox"]') ||
			target.closest('input[type="checkbox"]') ||
			target.tagName === 'INPUT'
		) {
			return;
		}
		onSelect?.();
	}

	function handleCheckboxChange(checked: boolean) {
		tasksAPI.updateTask({
			id: task.id,
			status: checked ? TaskStatus.complete : TaskStatus.incomplete
		});
	}
</script>

<div class="flex items-center gap-2">
	<Checkbox checked={completed} onCheckedChange={handleCheckboxChange} />
	<Separator orientation="vertical" />
	{#if onSelect !== undefined}
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left transition-colors hover:bg-white"
			onclick={handleItemClick}
		>
			{task.data.title}
		</button>
	{:else}
		{task.data.title}
	{/if}
	{#if onLocateTask !== undefined}
		<button
			class="
		flex
		size-6
		shrink-0
		items-center
		justify-center
		rounded-full
		text-gray-400
		hover:cursor-pointer
		hover:bg-blue-50
		hover:text-blue-600
		"
			onclick={() => onLocateTask?.(task)}
		>
			<Icon icon="lucide:locate" />
		</button>
	{/if}
</div>
