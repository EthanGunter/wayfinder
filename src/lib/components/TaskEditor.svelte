<script lang="ts">
	import { TaskStatus, type Task } from '$lib/API/Tasks/Task';
	import { type Snippet } from 'svelte';
	interface Props {
		task: Task;
		onTaskChange?: (original: Task, update: Partial<Task>) => void;
		children: Snippet;
	}
	let { task = $bindable(), onTaskChange, children }: Props = $props();
	let checked = $derived(task.status === TaskStatus.complete);

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.name === 'description') {
			task.content = target.value;
		}
		onTaskChange?.(task, { [target.name]: target.value });
	}

	function handleCheckbox(event: Event) {
		const target = event.target as HTMLInputElement;
		onTaskChange?.(task, { status: target.checked ? TaskStatus.complete : TaskStatus.incomplete });
	}
</script>

<div class="flex flex-col h-full">
	<div class="flex items-center border-t border-b border-gray-400">
		<input type="checkbox" name="completed" bind:checked onchange={handleCheckbox} class="ml-4" />
		<input
			name="title"
			class="flex-grow text-2xl border-b border-gray-400 m-4"
			placeholder="Title"
			bind:value={task.title}
			oninput={handleInput}
		/>
	</div>
	<div class="flex p-2 gap-2">
		<textarea
			name="description"
			id="task-editor-notes"
			placeholder="Notes"
			bind:value={task.content}
			oninput={handleInput}
			class="w-full min-h-12"
		></textarea>
	</div>
	<div class="relative flex flex-col mb-4 flex-grow before:content-[''] before:pointer-events-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:z-[5] before:shadow-[inset_0_10px_0.6rem_-10px_rgba(25,24,24,0.32),inset_0_-10px_0.6rem_-10px_rgba(25,24,24,0.32)] before:border-b before:border-gray-400">
		{@render children()}
	</div>
</div>
