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

<div class="flex h-full flex-col p-4">
	<div class="flex items-center border-t border-b border-gray-400 px-4">
		<Checkbox
			class="rounded-md border-gray-500 p-2 text-xl size-5"
			bind:checked
			aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
		/>
		<input
			name="title"
			class="my-4 ms-4 flex-grow border-b border-gray-400 text-2xl"
			placeholder="Title"
			bind:value={task.title}
			oninput={handleInput}
		/>
	</div>
	<div class="flex gap-2 p-2">
		<textarea
			name="description"
			id="task-editor-notes"
			placeholder="Notes"
			bind:value={task.content}
			oninput={handleInput}
			class="min-h-12 w-full"
		></textarea>
	</div>
	<div
		class="relative mb-4 flex flex-grow flex-col before:pointer-events-none before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:z-[5] before:block before:border-b before:border-gray-400 before:shadow-[inset_0_10px_0.6rem_-10px_rgba(25,24,24,0.32),inset_0_-10px_0.6rem_-10px_rgba(25,24,24,0.32)] before:content-['']"
	>
		{@render children()}
	</div>
</div>
