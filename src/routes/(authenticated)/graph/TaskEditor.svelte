<script lang="ts">
	// TODO This file is currently task-bound,
	// but soon we'll want it to accept generic nodes,
	// and draw custom editors for each node type.
	import Icon from '@iconify/svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Accordion from '$lib/components/ui/accordion';

	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import {
		isTaskCompleted,
		TaskStatus,
		type Task,
		type TaskData,
		type UpdateTaskParams
	} from '$domain/models/task';

	import TaskList from './TaskList.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import ScrollWithHeader from '$lib/components/ScrollWithHeader.svelte';
	import { drawerOpen, drawerParams } from './logic/ui-state';
	import TaskSearchBar from '$lib/components/ui/task-searchbar/TaskSearchBar.svelte';
	import MarkdownEditor from '$lib/components/ui/markdown-editor';
	import type { AppNode } from '$domain/models/node';

	export interface NodeEditorLayoutState {
		accordionValues: ('tasks' | 'parent-order')[];
		showCompletedTasks: boolean;
		showCompletedSiblings: boolean;
	}
	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Omit<UpdateTaskParams, 'id'>) => void;
		onDelete: (task: Task) => void;
		onSelectNode?: (taskId: string, options?: { select?: boolean }) => void;
		layoutState?: NodeEditorLayoutState;
	}

	// Props
	let {
		task = $bindable(),
		layoutState = $bindable({
			accordionValues: ['tasks'],
			showCompletedTasks: false,
			showCompletedSiblings: false
		}),
		onDelete,
		onSelectNode
	}: Props = $props();

	// Internals
	let showDeleteDialog = $state(false);
	let showLinkDialog = $state(false);
	let linkParentId = $state<string | null>(null);
	let accordionValues = $derived(layoutState.accordionValues);

	// Derived live data from server as single sources of truth
	let checked = $derived(isTaskCompleted(task));
	const siblingsStore = tasksAPI.getSiblingsOf(task.id);
	const childTasksStore = tasksAPI.getChildrenOf(task.id);

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

	// Complete status mirrors task.status; no redundant state held
	function toggleCompleted(next: boolean) {
		const newStatus = next ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.data.status === newStatus) return;
		task.data.status = newStatus;
		tasksAPI.updateTask({ id: task.id, status: newStatus });
	}

	function handleInput(event: Event) {
		const el = event.target as HTMLInputElement | HTMLTextAreaElement;
		if (!el?.name) return;
		const patch: Partial<Task> = { [el.name]: el.value };
		Object.assign(task, patch);
		tasksAPI.updateTask({ id: task.id, ...patch });
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
		if (finishIndex === startIndex) return;

		const siblingsMap = $siblingsStore;
		if (siblingsMap.status !== 'resolved') return;

		// Find parent task by ID (Map keys are object references)
		let parent: AppNode | undefined;
		for (const [p] of siblingsMap.value.entries()) {
			if (p.id === parentId) {
				parent = p;
				break;
			}
		}
		if (!parent) return;

		const currentIds = (parent.children ?? []).slice();
		const from = currentIds.indexOf(movingId);
		if (from < 0) return;

		const targetId = currentIds[Math.min(finishIndex, currentIds.length - 1)];
		let to = targetId ? currentIds.indexOf(targetId) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, movingId);

		const [_, e] = await tasksAPI.updateTask({
			id: parentId,
			children: currentIds
		});
		if (e) Err.UNHANDLED(e, 'Failed to reorder siblings');
	}

	async function reorderChildren(movingId: string, startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;
		const children = $childTasksStore;
		if (children.status !== 'resolved') return;

		const currentIds = (task.children ?? []).slice();
		const from = currentIds.indexOf(movingId);
		if (from < 0) return;

		const list = children.value;
		const target = list[Math.min(finishIndex, list.length - 1)];
		let to = target ? currentIds.indexOf(target.id) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, movingId);

		task.children = currentIds;
		const [_, e] = await tasksAPI.updateTask({
			id: task.id,
			children: currentIds
		});
		if (e) e.UNHANDLED('Failed to reorder children');
	}

	function handleAddChildTask(parentId: string) {
		let parent: AppNode | undefined;

		// For children list, parent is the current task
		if (parentId === task.id) {
			parent = task;
		} else {
			// For siblings list, look up parent from siblings map
			const siblingsMap = $siblingsStore;
			if (siblingsMap.status === 'resolved') {
				for (const [p] of siblingsMap.value.entries()) {
					if (p.id === parentId) {
						parent = p;
						break;
					}
				}
			}
		}

		if (!parent) return;

		drawerParams.set({ relation: parent, mode: 'parent' });
		drawerOpen.set(true);
	}

	function getExistingChildren(parentId: string): string[] {
		if (parentId === task.id) {
			// For "Blocked By" list, use task.children
			return task.children ?? [];
		} else {
			// For "Priority" list, look up parent from siblingsStore
			const siblingsMap = $siblingsStore;
			if (siblingsMap.status === 'resolved') {
				for (const [p] of siblingsMap.value.entries()) {
					if (p.id === parentId) {
						return p.children ?? [];
					}
				}
			}
		}
		return [];
	}

	async function handleLinkTask(selectedTask: Task, parentId: string) {
		if (!parentId || !selectedTask.id || parentId === selectedTask.id) return;

		// Check if task is already a child
		const existingChildren = getExistingChildren(parentId);
		if (existingChildren.includes(selectedTask.id)) {
			// Task is already linked, just close the dialog
			showLinkDialog = false;
			linkParentId = null;
			return;
		}

		// Update parent: add selectedTask as child
		const [_, err1] = await tasksAPI.updateTask({
			id: parentId,
			addChildren: [selectedTask.id]
		});
		if (err1) {
			Err.UNHANDLED(err1, 'Failed to link task');
		}

		showLinkDialog = false;
		linkParentId = null;
	}

	async function handleDisconnectTask(child: string, parent: string) {
		const [_, err] = await tasksAPI.updateTask({
			id: parent,
			removeChildren: [child]
		});
		if (err) err?.UNHANDLED('Failed to disconnect task');
	}
</script>

<ScrollWithHeader
	class="relative flex h-full w-full flex-col bg-white {checked ? 'bg-[#efe]' : ''}"
>
	{#snippet header()}
		<div class="flex items-start gap-2 px-2 py-2">
			<Checkbox
				class="mt-1 size-5 rounded-md border-gray-300 hover:cursor-pointer"
				aria-label="Toggle complete"
				bind:checked
				onCheckedChange={(status) => toggleCompleted(status)}
			/>
			<input
				class="text-md mx-1 w-full border-0 border-b-1 bg-transparent font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				id="input-task-title"
				name="title"
				bind:value={task.data.title}
				placeholder="Task title"
				oninput={handleInput}
			/>
			<Separator orientation="vertical" />
			<button
				class="flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-red-50 hover:text-red-600"
				title="Delete task"
				onclick={confirmDelete}
			>
				<Icon icon="lucide:trash-2" class="" />
			</button>
		</div>
	{/snippet}

	{#snippet content()}
		<div class="flex h-full min-h-0 flex-col p-3">
			<MarkdownEditor
				value={task.data.content ?? ''}
				onChange={(md) => tasksAPI.updateTask({ id: task.id, content: md })}
			/>

			<Accordion.Root
				type="multiple"
				value={accordionValues}
				onValueChange={(e) => {
					layoutState.accordionValues = e as any;
				}}
				class="mt-auto"
			>
				<Accordion.Item value="tasks">
					<Accordion.Trigger
						class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
					>
						Blocked By
					</Accordion.Trigger>
					<Accordion.Content>
						{#if $childTasksStore.status === 'resolved'}
							{@const taskChildren = $childTasksStore.value.filter(
								(t) => t.data.type === 'task'
							) as Task[]}
							<TaskList
								showCompleted={layoutState.showCompletedTasks}
								tasks={taskChildren ?? []}
								parentId={task.id}
								id={`child-${task.id}`}
								onSelect={(id) => {
									onSelectNode?.(id);
								}}
								onDisconnect={handleDisconnectTask}
								onReorder={(taskId, startIndex, finishIndex) =>
									reorderChildren(taskId, startIndex, finishIndex)}
								onAddTask={handleAddChildTask}
								onLink={(parentId) => {
									linkParentId = task.id;
									showLinkDialog = true;
								}}
							/>
						{/if}
					</Accordion.Content>
				</Accordion.Item>
				{#if $siblingsStore.status === 'resolved'}
					<Accordion.Item value="parent-order">
						<Accordion.Trigger
							class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
						>
							Priority
						</Accordion.Trigger>
						<Accordion.Content>
							<div class="flex flex-col gap-4">
								{#each $siblingsStore.value as [parent, siblings] (parent.id)}
									{@const taskSiblings = siblings.filter((s) => s.data.type === 'task') as Task[]}
									<TaskList
										showCompleted={layoutState.showCompletedSiblings}
										tasks={taskSiblings}
										parentId={parent.id}
										id={`sibling-${parent.id}`}
										title={parent.data.title}
										currentTaskId={task.id}
										onSelect={(id) => onSelectNode?.(id)}
										onDisconnect={handleDisconnectTask}
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
	{/snippet}
</ScrollWithHeader>

<Dialog.Root bind:open={showDeleteDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Task</Dialog.Title>
		</Dialog.Header>
		<div class="p-4">
			<p class="mb-4">Are you sure you want to delete <strong>{task.data.title}</strong>?</p>
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => (showDeleteDialog = false)}>Cancel</Button>
			<Button variant="destructive" onclick={performDelete}>Delete Task</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={showLinkDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Link Task</Dialog.Title>
		</Dialog.Header>
		<div class="p-4">
			{#if linkParentId}
				<TaskSearchBar
					onTaskSelected={(selectedTask) => handleLinkTask(selectedTask, linkParentId!)}
				/>
			{/if}
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => {
					showLinkDialog = false;
					linkParentId = null;
				}}>Cancel</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
