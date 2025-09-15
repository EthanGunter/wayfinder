<script lang="ts">
	import { goto } from '$app/navigation';
	import { draggable, dragGroup } from '$lib/actions/dnd';
	import { TaskStatus, type Task, isTaskCompleted } from '$lib/API/Tasks/Task';
	import { Button } from '@/components/ui/button';
	import { Checkbox } from '@/components/ui/checkbox';
	import Icon from '@iconify/svelte';

	const {
		task = $bindable(),
		onTaskChange,
		onDragStart,
		onDrop
	}: {
		task: Task;
		onTaskChange?: (original: Task, changes: Partial<Task>) => void;
		onDragStart?: (e: CustomEvent) => void;
		onDrop?: (e: CustomEvent) => void;
	} = $props();

	// Create a reactive variable that's properly bound to the checkbox
	let checked = $state(isTaskCompleted(task));

	// Watch for changes to isCompleted and update the task
	$effect(() => {
		const newStatus = checked ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.status !== newStatus) {
			task.status = newStatus;
			onTaskChange?.(task, { status: newStatus });
		}
	});

	// Keep isCompleted in sync with external changes to task.status
	$effect(() => {
		checked = isTaskCompleted(task);
	});

	function handleDragStart(e: CustomEvent) {
		onDragStart?.(e);
	}

	function handleDrop(e: CustomEvent) {
		onDrop?.(e);
	}

	function navigateToTask() {
		goto(`/tasks/?id=${task.id}`);
	}
</script>

<li class="task-list-item" class:completed={checked} use:dragGroup>
	<!-- Completion checkbox -->
	<Checkbox
		class="mx-3 rounded-md border-gray-500 p-2 text-xl"
		bind:checked
		aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
	/>

	<!-- Draggable task title -->
	<span
		class="align-content-center h-full w-full cursor-grab overflow-hidden bg-transparent p-1 text-start text-ellipsis whitespace-nowrap"
		use:draggable={{
			type: 'task',
			data: task,
			onDragStart: handleDragStart,
			onDrop: handleDrop,
			delay: 0
		}}
	>
		{task.title}
	</span>

	<!-- Link to task editor -->
	<Button class="rounded-none bg-gray-800" onclick={navigateToTask} aria-label="Edit task">
		<Icon icon="majesticons:open" />
	</Button>
</li>
