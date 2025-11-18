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
	import ScrollWithHeader from '$lib/components/ScrollWithHeader.svelte';
	import { drawerOpen, drawerParams } from './logic/ui-state';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchTaskListItem from '../../lib/components/ui/task-searchbar/SearchTaskListItem.svelte';
	import { handleSearch } from './logic/search';
	import type { ITask } from '$domain/models/task';
	import { onMount } from 'svelte';
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
	const siblingsStore = tasksAPI.getSiblingsOf(task.id);
	const childTasksStore = tasksAPI.getChildrenOf(task.id);

	let notesEl = $state<HTMLTextAreaElement | null>(null);

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

	$effect(() => {
		task.content;
		if (notesEl) autosize(notesEl);
	});

	// Internals
	let showDeleteDialog = $state(false);
	let showLinkDialog = $state(false);
	let linkParentId = $state<string | null>(null);
	let linkSearchQuery = $state('');
	let accordionValues = $derived(layoutState.accordionValues);

	function autosize(el: HTMLTextAreaElement | HTMLInputElement) {
		if (!el || !(el instanceof HTMLTextAreaElement)) return;

		// Only apply height logic to textarea; inputs don't need it
		el.style.height = '0px';
		// Compensate for borders/padding reliably
		const borderBox = el.offsetHeight - el.clientHeight;
		el.style.height = Math.max(el.scrollHeight + borderBox, 48) + 'px';
	}

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

		const [_, e] = await tasksAPI.updateTask({
			id: parentId,
			data: { children: currentIds }
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

		const list = children.data;
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
			data: { children: currentIds }
		});
		if (e) e.UNHANDLED('Failed to reorder children');
	}

	function handleAddChildTask(parentId: string) {
		let parentTask: Task | undefined;

		// For children list, parent is the current task
		if (parentId === task.id) {
			parentTask = task;
		} else {
			// For siblings list, look up parent from siblings map
			const siblingsMap = $siblingsStore;
			if (siblingsMap.status === 'resolved') {
				for (const [p] of siblingsMap.data.entries()) {
					if (p.id === parentId) {
						parentTask = p;
						break;
					}
				}
			}
		}

		if (!parentTask) return;

		drawerParams.set({ relation: parentTask, mode: 'parent' });
		drawerOpen.set(true);
	}

	async function getFilteredSearchResults(query: string, parentId: string): Promise<Task[]> {
		const results = await handleSearch(query);

		// Get current children of parentId
		let existingChildren: string[] = [];

		if (parentId === task.id) {
			// For "Blocked By" list, use task.children
			existingChildren = task.children ?? [];
		} else {
			// For "Priority" list, look up parent from siblingsStore
			const siblingsMap = $siblingsStore;
			if (siblingsMap.status === 'resolved') {
				for (const [p] of siblingsMap.data.entries()) {
					if (p.id === parentId) {
						existingChildren = p.children ?? [];
						break;
					}
				}
			}
		}

		// Filter out tasks that are already children
		const existingChildrenSet = new Set(existingChildren);
		return results.filter((t) => !existingChildrenSet.has(t.id) && t.id !== parentId);
	}

	async function handleLinkTask(selectedTask: Task, parentId: string) {
		if (!parentId || !selectedTask.id || parentId === selectedTask.id) return;

		// Update parent: add selectedTask as child
		const [_, err1] = await tasksAPI.updateTask({
			id: parentId,
			data: {
				addChildren: [selectedTask.id]
			}
		});
		if (err1) {
			Err.UNHANDLED(err1, 'Failed to link task');
		}

		showLinkDialog = false;
		linkSearchQuery = '';
		linkParentId = null;
	}

	async function handleDisconnectTask(child: string, parent: string) {
		const [_, err] = await tasksAPI.updateTask({
			id: parent,
			data: {
				removeChildren: [child]
			}
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
				bind:value={task.title}
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
			<textarea
				class="w-full shrink-0 resize-none rounded-md p-2 text-sm text-gray-700 placeholder-gray-400 outline-1 focus:ring-0"
				bind:this={notesEl}
				name="content"
				bind:value={task.content}
				placeholder="Add notes or description..."
				oninput={handleInput}
				use:autosize
			></textarea>

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
						<TaskList
							showCompleted={layoutState.showCompletedTasks}
							tasks={($childTasksStore as { data: Task[] }).data ?? []}
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
								{#each $siblingsStore.data as [parent, siblings] (parent.id)}
									<TaskList
										showCompleted={layoutState.showCompletedSiblings}
										tasks={siblings}
										parentId={parent.id}
										id={`sibling-${parent.id}`}
										title={parent.title}
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
			<p class="mb-4">Are you sure you want to delete <strong>{task.title}</strong>?</p>
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
				<SearchBar
					bind:query={linkSearchQuery}
					placeholder="Search for a task to link..."
					handleQuery={(q) => getFilteredSearchResults(q, linkParentId!)}
					onItemSelected={(selectedTask) => handleLinkTask(selectedTask, linkParentId!)}
					autocomplete={false}
					sorter={(a, b) => {
						if (a.status == TaskStatus.complete) return 1;
						else if (b.status == TaskStatus.complete) return -1;
						else return 0;
					}}
				>
					{#snippet searchItems(task: Task)}
						<SearchTaskListItem
							{task}
							onSelect={() => {
								onSelectNode?.(task.id);
							}}
						/>
					{/snippet}
				</SearchBar>
			{/if}
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => {
					showLinkDialog = false;
					linkSearchQuery = '';
					linkParentId = null;
				}}>Cancel</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
