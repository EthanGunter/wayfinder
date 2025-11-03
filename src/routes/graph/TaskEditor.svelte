<script lang="ts">
	import Icon from '@iconify/svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Accordion from '$lib/components/ui/accordion';

	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';

	import {
		draggable,
		dropTargetForElements,
		monitorForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachClosestEdge,
		extractClosestEdge,
		type Edge as ClosestEdge
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
	import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
	export interface TaskEditorLayoutState {
		accordionValues: string[];
	}
	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Partial<Task>) => void;
		onDelete: (task: Task) => void;
		layoutState?: TaskEditorLayoutState;
	}

	// Props
	let {
		task = $bindable(),
		layoutState = $bindable({ accordionValues: [] }),
		onTaskChange,
		onDelete
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

	// --- DnD data shape
	type ItemData = { itemId: string; parentId: string; index: number; kind: 'sibling' | 'child' };
	const ITEM_KEY = Symbol('item');
	function makeItemData(
		itemId: string,
		parentId: string,
		index: number,
		kind: ItemData['kind']
	): ItemData & { [ITEM_KEY]: true } {
		return { [ITEM_KEY]: true, itemId, parentId, index, kind };
	}
	function isItemData(d: unknown): d is ItemData & { [ITEM_KEY]: true } {
		return !!d && typeof d === 'object' && (d as any)[ITEM_KEY] === true;
	}

	// --- Persist reorder operations
	async function reorderWithinParent(parentId: string, startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;

		const siblingsMap = $siblingsStore;
		if (siblingsMap.status !== 'resolved') return;

		let parentTask: Task | undefined;
		let siblings: Task[] | undefined;
		for (const [p, arr] of siblingsMap.data.entries()) {
			if (p.id === parentId) {
				parentTask = p;
				siblings = arr;
				break;
			}
		}
		if (!parentTask) return;

		const currentIds = (parentTask.children ?? []).slice();
		const movingId = task.id;

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

	async function reorderChildren(startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;
		const children = $childTasksStore;
		if (children.status !== 'resolved') return;
		const list = children.data;
		if (!list.length) return;

		const moving = list[startIndex];
		if (!moving) return;

		const currentIds = (task.children ?? []).slice();
		const from = currentIds.indexOf(moving.id);
		if (from < 0) return;

		const target = list[Math.min(finishIndex, list.length - 1)];
		let to = target ? currentIds.indexOf(target.id) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, moving.id);

		task.children = currentIds;
		const [_, e] = await tasksAPI.updateTask({ id: task.id, data: { children: currentIds } });
		if (e) Err.UNHANDLED(e, 'Failed to reorder children');
	}

	// --- DnD wiring
	let cleanupFns: Array<() => void> = [];
	function addCleanup(fn: () => void) {
		cleanupFns.push(fn);
	}
	function teardownDnD() {
		for (const fn of cleanupFns) {
			try {
				fn();
			} catch {
				// ignore
			}
		}
		cleanupFns = [];
	}

	function setupParentSectionDnD() {
		const siblings = $siblingsStore;
		if (siblings.status !== 'resolved') return;

		// One monitor handles all lists
		addCleanup(
			monitorForElements({
				canMonitor: ({ source }) => isItemData(source.data),
				onDrop: ({ location, source }) => {
					const target = location.current.dropTargets[0];
					if (!target) return;
					const src = source.data;
					const dst = target.data;
					if (!isItemData(src) || !isItemData(dst)) return;
					if (src.parentId !== dst.parentId || src.kind !== dst.kind) return;
					// compute finish index using closest-edge
					const closest = extractClosestEdge(dst) as ClosestEdge | null;
					const finishIndex = getReorderDestinationIndex({
						startIndex: src.index,
						indexOfTarget: dst.index,
						closestEdgeOfTarget: closest,
						axis: 'vertical'
					});
					if (dst.kind === 'sibling') {
						void reorderWithinParent(src.parentId, src.index, finishIndex);
					} else {
						void reorderChildren(src.index, finishIndex);
					}
				}
			})
		);

		// For every parent list: register item drop targets
		for (const [parent, siblingTasks] of siblings.data.entries()) {
			const container = document.querySelector(
				`[data-parent-container="${parent.id}"]`
			) as HTMLElement | null;
			if (!container) continue;

			const items = Array.from(container.querySelectorAll<HTMLElement>('[data-sibling-id]'));
			const ids = (parent.children ?? []).slice();
			for (const el of items) {
				const sibId = el.dataset.siblingId!;
				const index = ids.indexOf(sibId);
				if (index < 0) continue;
				const isSelected = sibId === task.id;
				// Selected item is draggable
				if (isSelected) {
					addCleanup(
						draggable({
							element: el.querySelector<HTMLElement>('[data-draggable]') ?? el,
							getInitialData: () => makeItemData(task.id, parent.id, index, 'sibling')
						})
					);
				}
				// Each item is a drop target with closest-edge data
				addCleanup(
					dropTargetForElements({
						element: el,
						canDrop: ({ source }) =>
							isItemData(source.data) &&
							source.data.parentId === parent.id &&
							source.data.kind === 'sibling',
						getData: ({ element, input }) =>
							attachClosestEdge(makeItemData(sibId, parent.id, index, 'sibling'), {
								element,
								input,
								allowedEdges: ['top', 'bottom']
							})
					})
				);
			}
		}
	}

	function setupChildrenSectionDnD() {
		const children = $childTasksStore;
		if (children.status !== 'resolved' || children.data.length === 0) return;

		const container = document.querySelector('[data-children-container]') as HTMLElement | null;
		if (!container) return;

		const items = Array.from(container.querySelectorAll<HTMLElement>('[data-child-id]'));
		const ids = (task.children ?? []).slice();

		// global monitor is already installed by setupParentSectionDnD; nothing to add here

		for (const el of items) {
			const id = el.dataset.childId!;
			const index = ids.indexOf(id);
			if (index < 0) continue;

			// Every child is draggable
			addCleanup(
				draggable({
					element: el.querySelector<HTMLElement>('[data-child-draggable]') ?? el,
					getInitialData: () => makeItemData(id, task.id, index, 'child')
				})
			);

			// Every child is a drop target
			addCleanup(
				dropTargetForElements({
					element: el,
					canDrop: ({ source }) =>
						isItemData(source.data) &&
						source.data.parentId === task.id &&
						source.data.kind === 'child',
					getData: ({ element, input }) =>
						attachClosestEdge(makeItemData(id, task.id, index, 'child'), {
							element,
							input,
							allowedEdges: ['top', 'bottom']
						})
				})
			);
		}
	}

	// Reinitialize DnD whenever rendered lists change
	$effect(() => {
		const siblings = $siblingsStore;
		const children = $childTasksStore;

		// defer until DOM is updated
		queueMicrotask(() => {
			teardownDnD();
			setupParentSectionDnD();
			setupChildrenSectionDnD();
		});
	});
</script>

<div class="task-editor flex h-full w-full flex-col p-3">
	<div class="mb-3 flex items-start gap-4 border-b-1 border-gray-200 pb-2">
		<Checkbox
			class="mt-1 size-5 rounded-md border-gray-300 hover:cursor-pointer"
			aria-label="Toggle complete"
			bind:checked
			onCheckedChange={(status) => toggleCompleted(status)}
		/>
		<div class="flex-1">
			<input
				id="input-task-title"
				name="title"
				class="w-full border-0 border-r-1 bg-transparent text-xl font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				placeholder="Task title"
				value={task.title}
				oninput={handleInput}
			/>
		</div>
		<button
			onclick={confirmDelete}
			class="mt-1 flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-red-50 hover:text-red-600"
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
		class="h-full w-full resize-none border-1 bg-transparent p-1 text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none"
		rows="3"
	></textarea>

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
								<div class="flex flex-col gap-2">
									<div class="flex gap-2 text-sm text-gray-600">
										<button
											class="hover:cursor-pointer"
											onclick={() => Err.NotImplemented('TaskEditor.linkToParent')}
										>
											<h2>{parent.title}</h2>
										</button>
									</div>
									<ul
										data-parent-container={parent.id}
										class="relative rounded border border-gray-200"
									>
										{#each sortedChildren.incomplete as cid (cid)}
											<li class="flex items-center gap-2 px-2 py-1 text-sm" data-sibling-id={cid}>
												{#if cid === task.id}
													<div
														class="flex-1 cursor-grab rounded border border-gray-300 bg-white px-2 py-1 select-none hover:border-gray-400 active:cursor-grabbing"
														data-draggable
														title="Drag to reorder within this parent"
													>
														<Icon
															icon="lucide:grip-vertical"
															class="mr-1 inline size-3 text-gray-400"
														/>
														<span>{task.title}</span>
													</div>
												{:else}
													<div
														class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500"
													>
														<span class="ml-5"
															>{siblings.find((s) => s.id === cid)?.title ?? cid}</span
														>
													</div>
												{/if}
											</li>
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
						<ul data-children-container class="relative rounded border border-gray-200">
							{#each sortedChildren.incomplete as child (child.id)}
								<li class="flex items-center gap-2 px-2 py-1 text-sm" data-child-id={child.id}>
									<div
										class="flex-1 cursor-grab rounded border border-gray-300 bg-white px-2 py-1 select-none hover:border-gray-400 active:cursor-grabbing"
										data-child-draggable
										title="Drag to reorder children"
									>
										<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 text-gray-400" />
										<span>{child.title}</span>
									</div>
								</li>
							{/each}
							{#if sortedChildren.complete.length > 0 && sortedChildren.incomplete.length > 0}
								<div class="flex items-center gap-3 px-2 py-3 text-xs font-medium text-gray-400">
									<div
										class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"
									></div>
									<span class="tracking-wider uppercase">Completed</span>
									<div
										class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"
									></div>
								</div>
							{/if}
							{#each sortedChildren.complete as child (child.id)}
								<li class="flex items-center gap-2 px-2 py-1 text-sm" data-child-id={child.id}>
									<div
										class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500"
									>
										<span class="ml-5">{child.title}</span>
									</div>
								</li>
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
