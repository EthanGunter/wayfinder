<script lang="ts">
	import Icon from '@iconify/svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Accordion from '$lib/components/ui/accordion';

	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';

	import TaskList from './TaskList.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	export interface TaskEditorLayoutState {
		accordionValues: ('tasks' | 'parent-order')[];
		showCompletedTasks: boolean;
		showCompletedSiblings: boolean;
	}
	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Partial<Task>) => void;
		onDelete: (task: Task) => void;
		onSelectNode?: (taskId: string, options?: { select?: boolean }) => void;
		layoutState?: TaskEditorLayoutState;
	}

	// Props
	let {
		task = $bindable(),
		layoutState = $bindable({
			accordionValues: ['tasks'],
			showCompletedTasks: false,
			showCompletedSiblings: false
		}),
		onTaskChange,
		onDelete,
		onSelectNode
	}: Props = $props();

	// Derived live data from server as single sources of truth
	let checked = $derived(isTaskCompleted(task));
	const siblingsStore = tasksAPI.getSiblingsOf({ id: task.id });
	const childTasksStore = tasksAPI.getChildrenOf({ id: task.id });

	$effect(() => {
		task.id;
		siblingsStore.updateQuery({ id: task.id });
		childTasksStore.updateQuery({ id: task.id });
	});

	$effect(() => {
		if ($siblingsStore.status === 'error') {
			Err.UNHANDLED($siblingsStore.error, 'Failed to get siblings');
		}
	});

	// Internals
	let showDeleteDialog = $state(false);
	let accordionValues = $derived(layoutState.accordionValues);

	// Complete status mirrors task.status; no redundant state held
	function toggleCompleted(next: boolean) {
		const newStatus = next ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.status === newStatus) return;
		task.status = newStatus;
		onTaskChange?.(task, { status: newStatus });
	}

	function handleInput(event: Event) {
		const el = event.target as HTMLInputElement | HTMLTextAreaElement;
		if (!el?.name) return;
		const patch: Partial<Task> = { [el.name]: el.value };
		Object.assign(task, patch);
		onTaskChange?.(task, patch);
	}

	function confirmDelete() {
		showDeleteDialog = true;
	}

	function performDelete() {
		showDeleteDialog = false;
		onDelete?.(task);
	}

	// --- Reorder operations (passed as callbacks to TaskList)
	async function reorderWithinParent(
		parentId: string,
		movingId: string,
		startIndex: number,
		finishIndex: number
	) {
		console.log('reorderWithinParent', parentId, movingId, startIndex, finishIndex);

		if (finishIndex === startIndex) return;

		const siblingsMap = $siblingsStore;
		if (siblingsMap.status !== 'resolved') return;

		// Find parent task by ID (Map keys are object references)
		let parentTask: Task | undefined;
		for (const [p] of siblingsMap.data.entries()) {
			if (p.id === parentId) {
				parentTask = p;
				break;
			}
		}
		if (!parentTask) return;

		const currentIds = (parentTask.children ?? []).slice();
		const from = currentIds.indexOf(movingId);
		if (from < 0) return;

		const targetId = currentIds[Math.min(finishIndex, currentIds.length - 1)];
		let to = targetId ? currentIds.indexOf(targetId) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, movingId);

		const [_, e] = await tasksAPI.updateTask({ id: parentId, data: { children: currentIds } });
		if (e) Err.UNHANDLED(e, 'Failed to reorder siblings');
	}

	async function reorderChildren(movingId: string, startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;
		const children = $childTasksStore;
		if (children.status !== 'resolved') return;

		const currentIds = (task.children ?? []).slice();
		const from = currentIds.indexOf(movingId);
		if (from < 0) return;

		const list = children.data;
		const target = list[Math.min(finishIndex, list.length - 1)];
		let to = target ? currentIds.indexOf(target.id) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, movingId);

		task.children = currentIds;
		const [_, e] = await tasksAPI.updateTask({ id: task.id, data: { children: currentIds } });
		if (e) Err.UNHANDLED(e, 'Failed to reorder children');
	}
</script>

<div class="task-editor flex h-full w-full flex-col p-3" class:bg-[#efe]={checked}>
	<div class="flex h-full w-full resize-none flex-col rounded-xl border-1 bg-white p-1">
		<div class="flex items-start gap-2 px-2 py-2">
			<Checkbox
				class="mt-1 size-5 rounded-md border-gray-300 hover:cursor-pointer"
				aria-label="Toggle complete"
				bind:checked
				onCheckedChange={(status) => toggleCompleted(status)}
			/>
			<input
				id="input-task-title"
				name="title"
				class="text-md mx-1 w-full border-0 border-b-1 bg-transparent font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				placeholder="Task title"
				value={task.title}
				oninput={handleInput}
			/>
			<Separator orientation="vertical" />
			<button
				onclick={confirmDelete}
				class="flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-red-50 hover:text-red-600"
				title="Delete task"
			>
				<Icon icon="lucide:trash-2" class="size-4" />
			</button>
		</div>

		<textarea
			name="content"
			id="task-editor-notes"
			placeholder="Add notes or description..."
			value={task.content}
			oninput={handleInput}
			class=" h-full resize-none p-2 text-sm text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none"
			rows="3"
		></textarea>
	</div>

	<Accordion.Root
		type="multiple"
		value={accordionValues}
		onValueChange={(e) => {
			layoutState.accordionValues = e as any;
		}}
	>
		{#if $childTasksStore.status === 'resolved' && $childTasksStore.data.length > 0}
			<Accordion.Item value="tasks">
				<Accordion.Trigger
					class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
				>
					Tasks
				</Accordion.Trigger>
				<Accordion.Content>
					<TaskList
						showCompleted={layoutState.showCompletedTasks}
						tasks={$childTasksStore.data}
						parentId={task.id}
						id={`child-${task.id}`}
						onSelect={(id) => {
							onSelectNode?.(id);
						}}
						onReorder={(taskId, startIndex, finishIndex) =>
							reorderChildren(taskId, startIndex, finishIndex)}
					/>
				</Accordion.Content>
			</Accordion.Item>
		{/if}
		{#if $siblingsStore.status === 'resolved'}
			<Accordion.Item value="parent-order">
				<Accordion.Trigger
					class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
				>
					Priority
				</Accordion.Trigger>
				<Accordion.Content>
					<div class="flex flex-col gap-4">
						{#each $siblingsStore.data as [parent, siblings] (parent.id)}
							<TaskList
								showCompleted={layoutState.showCompletedSiblings}
								tasks={siblings}
								parentId={parent.id}
								id={`sibling-${parent.id}`}
								title={parent.title}
								currentTaskId={task.id}
								onSelect={(id) => onSelectNode?.(id)}
								onReorder={(taskId, startIndex, finishIndex) =>
									reorderWithinParent(parent.id, taskId, startIndex, finishIndex)}
							/>
						{/each}
					</div>
				</Accordion.Content>
			</Accordion.Item>
		{/if}
	</Accordion.Root>
</div>

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
			<Button variant="destructive" onclick={performDelete}>Delete Task</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
