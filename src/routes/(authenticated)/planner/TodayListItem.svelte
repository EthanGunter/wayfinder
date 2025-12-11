<script lang="ts">
	import { isTaskCompleted, TaskStatus, type Task, type TaskData } from '$domain/models/task';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import Icon from '@iconify/svelte';

	const {
		task = $bindable(),
		projectId,
		onTaskChange,
		onRemoveFromToday
	}: {
		task: Task;
		projectId: string;
		onTaskChange?: (original: Task, changes: Partial<TaskData>) => void;
		onRemoveFromToday?: (task: Task) => void;
	} = $props();

	// Create a reactive variable that's properly bound to the checkbox
	let checked = $state(isTaskCompleted(task));

	// Watch for changes to isCompleted and update the task
	$effect(() => {
		const newStatus = checked ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.data.status !== newStatus) {
			onTaskChange?.(task, { status: newStatus });
		}
	});

	// Keep isCompleted in sync with external changes to task.status
	$effect(() => {
		checked = isTaskCompleted(task);
	});

	function handleRemoveFromToday() {
		onRemoveFromToday?.(task);
	}

	function handleClick() {
		goto(`/projects/${projectId}?select=${task.id}`);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<li class="task-list-item flex items-center gap-2" class:completed={checked}>
	<!-- Completion checkbox -->
	<Checkbox
		class="mx-3 rounded-md border-gray-500 p-2 text-xl"
		bind:checked
		aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
	/>

	<!-- Clickable task title -->
	<span
		role="button"
		tabindex="0"
		onclick={handleClick}
		onkeydown={handleKeydown}
		class="h-full w-full cursor-pointer overflow-hidden bg-transparent p-1 text-start text-ellipsis whitespace-nowrap hover:underline"
	>
		{task.data.title}
	</span>

	<!-- Remove from today button -->
	<Button class="rounded-none bg-gray-800" onclick={handleRemoveFromToday} aria-label="Remove from today's list">
		<Icon icon="lucide:x" />
	</Button>
</li>

