<script lang="ts">
	import { type Snippet } from 'svelte';
	import Checkbox from '../../lib/components/ui/checkbox/checkbox.svelte';
	import Icon from '@iconify/svelte';
	import * as Dialog from '../../lib/components/ui/dialog';
	import Button from '../../lib/components/ui/button/button.svelte';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';

	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Partial<Task>) => void;
		onDelete: (task: Task, recursive: boolean) => void;
		children?: Snippet;
	}
	let { task = $bindable(), onTaskChange, onDelete, children }: Props = $props();
	let checked = $state(isTaskCompleted(task));
	let showDeleteDialog = $state(false);

	// First, keep isCompleted in sync with external changes to task.status
	$effect(() => {
		checked = isTaskCompleted(task);
	});

	// Then watch for changes to isCompleted and update the task
	$effect(() => {
		const newStatus = checked ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.status !== newStatus) {
			task.status = newStatus;
			onTaskChange?.(task, { status: newStatus });
		}
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.name === 'content') {
			task.content = target.value;
		}
		onTaskChange?.(task, { [target.name]: target.value });
	}

	function openDeleteDialog() {
		showDeleteDialog = true;
	}

	function handleDelete() {
		onDelete?.(task, true); // Always delete recursively to maintain graph integrity
		showDeleteDialog = false;
	}
</script>

<div class="task-editor flex flex-col p-6">
	<!-- Task Header -->
	<div class="mb-3 flex items-start gap-4 border-b-1 border-gray-200 pb-2">
		<Checkbox
			class="mt-1 size-5 rounded-md border-gray-300"
			bind:checked
			aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
		/>
		<div class="flex-1">
			<input
				id="input-task-title"
				name="title"
				class="w-full border-0 border-r-1 bg-transparent text-xl font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				placeholder="Task title"
				bind:value={task.title}
				oninput={handleInput}
			/>
		</div>
		<button
			onclick={openDeleteDialog}
			class="mt-1 flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
			title="Delete task"
		>
			<Icon icon="lucide:trash-2" class="size-4" />
		</button>
	</div>

	<!-- Task Description -->

	<textarea
		name="content"
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

	{#if children}
		<div class="border-t border-gray-300 pt-6">
			{@render children()}
		</div>
	{/if}
</div>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={showDeleteDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Task</Dialog.Title>
		</Dialog.Header>
		<div class="p-4">
			<p class="mb-4">Are you sure you want to delete <strong>{task.title}</strong>?</p>
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => (showDeleteDialog = false)}>Cancel</Button>
			<Button variant="destructive" onclick={handleDelete}>Delete Task</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
