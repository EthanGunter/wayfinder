<script lang="ts">
	import Icon from '@iconify/svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Accordion from '$lib/components/ui/accordion';

	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';

	import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
	import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
	import TaskListItem from './TaskListItem.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	export interface TaskEditorLayoutState {
		accordionValues: string[];
	}
	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Partial<Task>) => void;
		onDelete: (task: Task) => void;
		onHighlightNode?: (taskId: string, options?: { select?: boolean }) => void;
		layoutState?: TaskEditorLayoutState;
	}

	// Props
	let {
		task = $bindable(),
		layoutState = $bindable({ accordionValues: [] }),
		onTaskChange,
		onDelete,
		onHighlightNode
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
		if ($siblingsStore.status === 'error')
			Err.UNHANDLED($siblingsStore.error, 'Failed to get siblings');
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
		onDelete?.(task);
		showDeleteDialog = false;
	}

	// --- DnD data shape (aligned with TaskListItem)
	type ItemData = {
		taskId: string;
		parentId: string;
		index: number;
		listType: 'sibling' | 'child';
	};
	const ITEM_KEY = Symbol('item');
	function isItemData(d: unknown): d is ItemData & { [ITEM_KEY]: true } {
		return !!d && typeof d === 'object' && (d as any)[ITEM_KEY] === true;
	}

	// --- Persist reorder operations
	async function reorderWithinParent(
		parentId: string,
		movingId: string,
		startIndex: number,
		finishIndex: number
	) {
		if (finishIndex === startIndex) return;

		const siblingsMap = $siblingsStore;
		if (siblingsMap.status !== 'resolved') return;

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

	// --- DnD coordination (global monitor only; items self-manage)
	$effect(() => {
		const cleanup = monitorForElements({
			canMonitor: ({ source }) => isItemData(source.data),
			onDrop: ({ location, source }) => {
				const target = location.current.dropTargets[0];
				if (!target) return;
				const src = source.data;
				const dst = target.data;
				if (!isItemData(src) || !isItemData(dst)) return;
				if (src.parentId !== dst.parentId || src.listType !== dst.listType) return;

				const closest = extractClosestEdge(dst);
				const finishIndex = getReorderDestinationIndex({
					startIndex: src.index,
					indexOfTarget: dst.index,
					closestEdgeOfTarget: closest,
					axis: 'vertical'
				});

				if (dst.listType === 'sibling') {
					void reorderWithinParent(src.parentId, src.taskId, src.index, finishIndex);
				} else {
					void reorderChildren(src.taskId, src.index, finishIndex);
				}
			}
		});

		return cleanup;
	});
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
			<button
				onclick={() => onHighlightNode?.(task.id, { select: false })}
				class="flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-blue-50 hover:text-blue-600"
				title="Center this task in graph view"
			>
				<Icon icon="lucide:locate-fixed" class="size-4" />
			</button>
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

	{#if $siblingsStore.status === 'resolved' && $childTasksStore.status === 'resolved'}
		<Accordion.Root
			type="multiple"
			value={accordionValues}
			onValueChange={(e) => {
				layoutState.accordionValues = e;
			}}
		>
			{#if $siblingsStore.data.size > 0}
				<Accordion.Item value="parent-order">
					<Accordion.Trigger
						class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
					>
						Priority
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="flex flex-col gap-4">
							{#each Array.from($siblingsStore.data.entries()) as [parent, siblings] (parent.id)}
								{@const sortedChildren = (() => {
									const ids = parent.children ?? [];
									const incomplete: string[] = [];
									const complete: string[] = [];
									for (const cid of ids) {
										const sibling = siblings.find((s) => s.id === cid);
										if (sibling && isTaskCompleted(sibling)) {
											complete.push(cid);
										} else {
											incomplete.push(cid);
										}
									}
									return { incomplete, complete };
								})()}
								<div class="ml-3 flex flex-col">
									<button
										class="w-fit rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-sm text-gray-700 hover:cursor-pointer hover:bg-gray-100"
										onclick={() => onHighlightNode?.(parent.id)}
									>
										<h2>{parent.title}</h2>
									</button>
									<ul class="relative rounded-lg rounded-tl-none border border-gray-200 bg-gray-50">
										{#each sortedChildren.incomplete as cid, index (cid)}
											{@const sibling = cid === task.id ? task : siblings.find((s) => s.id === cid)}
											{#if sibling}
												<TaskListItem
													task={sibling}
													parentId={parent.id}
													listType="sibling"
													{index}
													isCurrent={cid === task.id}
													isDraggable={cid === task.id}
													onHighlight={(id) => onHighlightNode?.(id, { select: false })}
												/>
											{/if}
										{/each}
									</ul>
								</div>
							{/each}
						</div>
					</Accordion.Content>
				</Accordion.Item>
			{/if}

			{#if $childTasksStore.data.length > 0}
				<Accordion.Item value="children">
					<Accordion.Trigger
						class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
					>
						Children
					</Accordion.Trigger>
					<Accordion.Content>
						{@const sortedChildren = (() => {
							const incomplete = $childTasksStore.data.filter((c) => !isTaskCompleted(c));
							const complete = $childTasksStore.data.filter((c) => isTaskCompleted(c));
							return { incomplete, complete };
						})()}
						<ul class="relative rounded border border-gray-200">
							{#each sortedChildren.incomplete as child, index (child.id)}
								<TaskListItem
									task={child}
									parentId={task.id}
									listType="child"
									{index}
									isDraggable={true}
									onHighlight={(id) => onHighlightNode?.(id, { select: false })}
								/>
							{/each}
							{#if sortedChildren.complete.length > 0}
								<div class="flex items-center gap-3 px-2 pt-3 text-xs font-medium text-gray-400">
									<div
										class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"
									></div>
									<span class="tracking-wider uppercase">Completed</span>
									<div
										class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"
									></div>
								</div>
							{/if}
							{#each sortedChildren.complete as child, index (child.id)}
								<TaskListItem
									task={child}
									parentId={task.id}
									listType="child"
									index={sortedChildren.incomplete.length + index}
									isDraggable={false}
									onHighlight={(id) => onHighlightNode?.(id, { select: false })}
								/>
							{/each}
						</ul>
					</Accordion.Content>
				</Accordion.Item>
			{/if}
		</Accordion.Root>
	{/if}
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
