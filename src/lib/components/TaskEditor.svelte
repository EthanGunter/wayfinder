<script lang="ts">
	import { TaskStatus, type Task } from '$lib/API/Tasks/Task';
	import { type Snippet } from 'svelte';
	import Checkbox from './ui/checkbox/checkbox.svelte';
	interface Props {
		task: Task;
		onTaskChange?: (original: Task, update: Partial<Task>) => void;
		children: Snippet;
	}
	let { task = $bindable(), onTaskChange, children }: Props = $props();
	let checked = $state(task.completed);

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
		checked = task.completed;
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.name === 'description') {
			task.content = target.value;
		}
		onTaskChange?.(task, { [target.name]: target.value });
	}
</script>

<div class="flex flex-col p-6">
	<!-- Task Header -->
	<div class="flex items-start gap-4 pb-2 mb-3 border-b-1 border-gray-200">
		<Checkbox
			class="mt-1 size-5 rounded-md border-gray-300"
			bind:checked
			aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
		/>
		<div class="flex-1">
			<input
				name="title"
				class="w-full border-0 bg-transparent text-2xl font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				placeholder="Task title"
				bind:value={task.title}
				oninput={handleInput}
			/>
		</div>
	</div>

	<!-- Task Description -->

	<textarea
		name="description"
		id="task-editor-notes"
		placeholder="Add notes or description..."
		bind:value={task.content}
		oninput={handleInput}
		class="w-full resize-none border-0 bg-transparent text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none"
		rows="3"
	></textarea>

	<!-- Future: Expandable Details Section -->
	<!-- This will house additional fields like due date, priority, tags, etc. -->
	<!--
	<div class="pb-6">
		<button class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
			<span>Show more details</span>
			<Icon icon="lucide:chevron-down" />
		</button>
	</div>
	-->

	<!-- Children Section -->
	<div class="border-t border-gray-300 pt-6">
		{@render children()}
	</div>
</div>
