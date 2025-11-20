<script lang="ts">
	import { goto } from '$app/navigation';
	import { isTaskCompleted, TaskStatus, type Task, type TaskData } from '$domain/models/task';
	import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import Icon from '@iconify/svelte';

	const {
		task = $bindable(),
		onTaskChange
	}: {
		task: Task;
		onTaskChange?: (original: Task, changes: Partial<TaskData>) => void;
	} = $props();

	// Create a reactive variable that's properly bound to the checkbox
	let checked = $state(isTaskCompleted(task));

	// Watch for changes to isCompleted and update the task
	$effect(() => {
		const newStatus = checked ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.data.status !== newStatus) {
			// task.data.status = newStatus; <- I don't think this does anything
			onTaskChange?.(task, { status: newStatus });
		}
	});

	// Keep isCompleted in sync with external changes to task.status
	$effect(() => {
		checked = isTaskCompleted(task);
	});

	function navigateToTask() {
		goto(`/graph/?select=${task.id}`);
	}

	let itemEl: HTMLElement | undefined = $state();
	let dragHandleEl: HTMLElement | undefined = $state();

	// Set up draggable with pragmatic-dnd
	$effect(() => {
		if (!itemEl || !dragHandleEl) return;

		return draggable({
			element: itemEl,
			dragHandle: dragHandleEl,
			getInitialData: () => ({ type: 'task', task })
		});
	});
</script>

<li class="task-list-item flex items-center gap-2" class:completed={checked} bind:this={itemEl}>
	<!-- Completion checkbox -->
	<Checkbox
		class="mx-3 rounded-md border-gray-500 p-2 text-xl"
		bind:checked
		aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
	/>

	<!-- Draggable task title -->
	<span
		bind:this={dragHandleEl}
		class="h-full w-full cursor-grab overflow-hidden bg-transparent p-1 text-start text-ellipsis whitespace-nowrap active:cursor-grabbing"
	>
		{task.data.title}
	</span>

	<!-- Link to task editor -->
	<Button class="rounded-none bg-gray-800" onclick={navigateToTask} aria-label="Edit task">
		<Icon icon="majesticons:open" />
	</Button>
</li>
