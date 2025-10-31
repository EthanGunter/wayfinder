<script lang="ts">
	import { type Snippet } from 'svelte';
	import { get, readable, type Readable } from 'svelte/store';
	import Checkbox from '../../lib/components/ui/checkbox/checkbox.svelte';
	import Icon from '@iconify/svelte';
	import * as Dialog from '../../lib/components/ui/dialog';
	import Button from '../../lib/components/ui/button/button.svelte';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';
	import * as Accordion from '$lib/components/ui/accordion';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachClosestEdge,
		extractClosestEdge,
		type Edge as ClosestEdge
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
	import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
	import type { FetchableReadable } from '$lib/API/fetchableStore';

	interface Props {
		task: Task;
		onTaskChange: (original: Task, update: Partial<Task>) => void;
		onDelete: (task: Task) => void;
		children?: Snippet;
	}
	let { task = $bindable(), onTaskChange, onDelete, children }: Props = $props();
	let checked = $state(isTaskCompleted(task));
	let showDeleteDialog = $state(false);
	let priorityAccordionValue = $state<string[]>([]);

	// Sibling ordering per-parent context
	let parentTasks = $derived(tasksAPI.getParentsOf({ id: task.id }));
	// Reactive store that recreates when task.id changes
	let childTasks = $derived(tasksAPI.getChildrenOf({ id: task.id }));

	// Compute union of all children ids across parents and a per-parent index
	type ParentChildrenIndex = { ids: string[]; byParent: Map<string, string[]> };
	let parentChildrenIndex: ParentChildrenIndex = $derived(
		$parentTasks.status !== 'resolved'
			? { ids: [], byParent: new Map<string, string[]>() }
			: (() => {
					const byParent = new Map<string, string[]>();
					const idSet = new Set<string>();
					for (const p of $parentTasks.data) {
						const ids = (p.children ?? []).slice();
						byParent.set(p.id, ids);
						for (const id of ids) idSet.add(id);
					}
					return { ids: Array.from(idSet), byParent } as ParentChildrenIndex;
				})()
	);

	// Single live store for all sibling tasks of current parents
	let allSiblingTasks = $derived(tasksAPI.getTasks({ ids: parentChildrenIndex.ids }));

	// Live map from parentId -> ordered Task[]
	let siblingsByParent: Map<string, Task[]> = $derived(
		$parentTasks.status !== 'resolved' || $allSiblingTasks.status !== 'resolved'
			? new Map<string, Task[]>()
			: (() => {
					const byId = new Map($allSiblingTasks.data.map((t) => [t.id, t] as [string, Task]));
					const map = new Map<string, Task[]>();
					for (const p of $parentTasks.data) {
						const ids = parentChildrenIndex.byParent.get(p.id) ?? [];
						const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Task[];
						map.set(p.id, ordered);
					}
					return map as Map<string, Task[]>;
				})()
	);
	// Container lookup via data attribute instead of bind:this per list

	// No manual refresh needed — siblingsByParent updates live via derived stores

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
		onDelete?.(task);
		showDeleteDialog = false;
	}

	// --- Pragmatic DnD wiring for a single draggable (the selected task) per list ---
	let cleanupFns: (() => void)[] = [];
	let monitorCleanup: (() => void) | null = null;
	function teardownDnD() {
		for (const fn of cleanupFns)
			try {
				fn();
			} catch {}
		cleanupFns = [];
		if (monitorCleanup) {
			try {
				monitorCleanup();
			} catch {}
			monitorCleanup = null;
		}
	}

	// Data shape for drag items
	type ItemData = { itemId: string; parentId: string; index: number };
	const itemKey = Symbol('item');
	function getItemData(
		itemId: string,
		parentId: string,
		index: number
	): ItemData & { [itemKey]: true } {
		return { [itemKey]: true, itemId, parentId, index };
	}
	function isItemData(
		data: Record<string | symbol, unknown>
	): data is ItemData & { [itemKey]: true } {
		return data[itemKey] === true;
	}

	function setupDnDForParent(parentId: string) {
		const container = document.querySelector(
			`[data-parent-container="${parentId}"]`
		) as HTMLElement | null;
		if (!container) {
			return;
		}
		const list = siblingsByParent.get(parentId) || [];

		// Create a shared indicator line for this list
		const indicator = document.createElement('div');
		indicator.className = 'dnd-insert-indicator';
		indicator.style.display = 'none';
		container.appendChild(indicator);
		cleanupFns.push(() => {
			try {
				indicator.remove();
			} catch {}
		});

		// Register drop targets for each sibling item to capture closest edge (before/after)
		const items = Array.from(container.querySelectorAll('[data-sibling-id]')) as HTMLElement[];
		for (let i = 0; i < items.length; i++) {
			const el = items[i];
			const sibId = el.dataset.siblingId as string;
			const index = list.findIndex((t) => t.id === sibId);
			if (index < 0) continue;
			const data = getItemData(sibId, parentId, index);

			const stop = dropTargetForElements({
				element: el,
				canDrop: ({ source }) => isItemData(source.data) && source.data.parentId === parentId,
				getData: ({ element, input }: any) => {
					// Restrict to vertical reorder semantics
					return attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] });
				},
				onDrag: ({ self, source }: any) => {
					const edge = extractClosestEdge(self.data) as ClosestEdge | null;
					const li = self.element as HTMLElement;
					// Hide when hovering over source in a no-op position (adjacent rules)
					const srcData = source?.data;
					const selfIndex = (self.data as any)?.index as number | undefined;
					const srcIndex = isItemData(srcData) ? (srcData.index as number) : undefined;
					const hideIndicator =
						srcIndex !== undefined &&
						selfIndex !== undefined &&
						((selfIndex === srcIndex - 1 && edge === 'bottom') ||
							(selfIndex === srcIndex + 1 && edge === 'top') ||
							selfIndex === srcIndex);
					if (!edge || hideIndicator) {
						indicator.style.display = 'none';
						return;
					}
					// Position the shared indicator line relative to the list container
					const y = edge === 'top' ? li.offsetTop : li.offsetTop + li.offsetHeight;
					indicator.style.top = y + 'px';
					indicator.style.display = 'block';
				},
				onDragLeave: ({ self }: any) => {
					indicator.style.display = 'none';
				},
				onDrop: ({ self }: any) => {
					indicator.style.display = 'none';
				}
			});
			cleanupFns.push(stop);
		}

		// Only the selected task is draggable in this list
		const draggableEl = container.querySelector('[data-draggable-selected]') as HTMLElement | null;
		if (!draggableEl) {
			console.warn('[DnD] Draggable element not found in parent', parentId);
			return;
		}
		const startIndex = list.findIndex((t) => t.id === task.id);
		if (startIndex < 0) {
			return;
		}

		const stopDrag = draggable({
			element: draggableEl,
			getInitialData: () => getItemData(task.id, parentId, startIndex)
		});
		cleanupFns.push(stopDrag);
	}

	function setupDnDForChildren(parentId: string, list: Task[]) {
		const container = document.querySelector('[data-children-container]') as HTMLElement | null;
		if (!container) {
			return;
		}
		if (!list.length) {
			return;
		}

		const indicator = document.createElement('div');
		indicator.className = 'dnd-insert-indicator';
		indicator.style.display = 'none';
		container.appendChild(indicator);
		cleanupFns.push(() => {
			try {
				indicator.remove();
			} catch {}
		});

		const items = Array.from(container.querySelectorAll('[data-child-id]')) as HTMLElement[];
		for (let i = 0; i < items.length; i++) {
			const el = items[i];
			const childId = el.dataset.childId as string;
			const index = list.findIndex((t) => t.id === childId);
			if (index < 0) continue;
			const data = getItemData(childId, parentId, index);

			const stop = dropTargetForElements({
				element: el,
				canDrop: ({ source }) => isItemData(source.data) && source.data.parentId === parentId,
				getData: ({ element, input }: any) =>
					attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
				onDrag: ({ self, source }: any) => {
					const edge = extractClosestEdge(self.data) as ClosestEdge | null;
					const li = self.element as HTMLElement;
					const srcData = source?.data;
					const selfIndex = (self.data as any)?.index as number | undefined;
					const srcIndex = isItemData(srcData) ? (srcData.index as number) : undefined;
					const hideIndicator =
						srcIndex !== undefined &&
						selfIndex !== undefined &&
						((selfIndex === srcIndex - 1 && edge === 'bottom') ||
							(selfIndex === srcIndex + 1 && edge === 'top') ||
							selfIndex === srcIndex);
					if (!edge || hideIndicator) {
						indicator.style.display = 'none';
						return;
					}
					const y = edge === 'top' ? li.offsetTop : li.offsetTop + li.offsetHeight;
					indicator.style.top = y + 'px';
					indicator.style.display = 'block';
				},
				onDragLeave: () => {
					indicator.style.display = 'none';
				},
				onDrop: () => {
					indicator.style.display = 'none';
					// TODO update child array
				}
			});
			cleanupFns.push(stop);

			const draggableEl = (el.querySelector('[data-child-draggable]') as HTMLElement | null) ?? el;
			const stopDrag = draggable({
				element: draggableEl,
				getInitialData: () => getItemData(childId, parentId, index)
			});
			cleanupFns.push(stopDrag);
		}
	}

	async function handleChildrenReorder(startIndex: number, finishIndex: number) {
		console.log('handleChildrenReorder', startIndex, finishIndex);

		if (finishIndex === startIndex) return;
		if ($childTasks.status !== 'resolved') return;

		console.log('childTasks', $childTasks.data);

		const list = $childTasks.data;
		if (!list.length) return;
		const movingTask = list[startIndex];
		if (!movingTask) return;

		const childrenIds = [...(task.children || [])];
		const from = childrenIds.indexOf(movingTask.id);
		if (from < 0) return;

		const targetTask = list[Math.min(finishIndex, list.length - 1)];
		let to = targetTask ? childrenIds.indexOf(targetTask.id) : childrenIds.length;
		if (to < 0) to = childrenIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		childrenIds.splice(from, 1);
		let adjustedTo = from < to ? to - 1 : to;
		if (adjustedTo < 0) adjustedTo = 0;
		if (adjustedTo > childrenIds.length) adjustedTo = childrenIds.length;
		childrenIds.splice(adjustedTo, 0, movingTask.id);

		task.children = childrenIds;

		const [_, e] = await tasksAPI.updateTask({ id: task.id, data: { children: childrenIds } });
		if (e) Err.UNHANDLED(e, 'Failed to reorder children');
	}

	async function handleReorder(parentId: string, startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;
		if (parentId === task.id) {
			await handleChildrenReorder(startIndex, finishIndex);
			return;
		}
		const parent =
			$parentTasks.status === 'resolved'
				? $parentTasks.data.find((p) => p.id === parentId)
				: undefined;
		if (!parent) return;
		const list = siblingsByParent.get(parentId) || [];
		const children = [...(parent.children || [])];
		const from = children.indexOf(task.id);
		if (from < 0) return;
		// Translate finishIndex in list to children index
		const targetChildId = list[Math.min(finishIndex, list.length - 1)]?.id;
		if (!targetChildId) return;
		let to = children.indexOf(targetChildId);
		// If moving below the target, insert after
		if (finishIndex > startIndex && to >= 0) to = to + 1;
		// Remove and insert
		children.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		children.splice(adjustedTo, 0, task.id);

		const [_, e] = await tasksAPI.updateTask({ id: parentId, data: { children } });
		if (e) Err.UNHANDLED(e, 'Failed to reorder siblings');
	}

	$effect(() => {
		// Track dependencies explicitly
		const parents = $parentTasks;
		const siblings = siblingsByParent;
		if ($childTasks.status !== 'resolved') return;
		const children = $childTasks.data;
		const currentTaskId = task.id;

		// Reinitialize DnD when parents or siblings change and DOM has rendered
		queueMicrotask(() => {
			teardownDnD();
			// Setup global monitor for drop coordination
			monitorCleanup = monitorForElements({
				canMonitor: ({ source }) => isItemData(source.data),
				onDrop: ({ location, source }) => {
					const target = location.current.dropTargets[0];
					if (!target) return;
					const sourceData = source.data;
					const targetData = target.data;
					if (!isItemData(sourceData) || !isItemData(targetData)) return;
					if (sourceData.parentId !== targetData.parentId) return;
					const closestEdge = extractClosestEdge(targetData);
					const finishIndex = getReorderDestinationIndex({
						startIndex: sourceData.index,
						indexOfTarget: targetData.index,
						closestEdgeOfTarget: closestEdge,
						axis: 'vertical'
					});
					void handleReorder(sourceData.parentId, sourceData.index, finishIndex);
				}
			});
			if ($parentTasks.status === 'resolved')
				for (const p of $parentTasks.data) setupDnDForParent(p.id);
			setupDnDForChildren(currentTaskId, children);
		});
	});
</script>

<div class="task-editor flex h-full w-full flex-col p-3">
	<!-- Task Header -->
	<div class="mb-3 flex items-start gap-4 border-b-1 border-gray-200 pb-2">
		<Checkbox
			class="mt-1 size-5 rounded-md border-gray-300 hover:cursor-pointer"
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
			class="mt-1 flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-red-50 hover:text-red-600"
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
		class="h-full w-full resize-none border-1 bg-transparent p-1 text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none"
		rows="3"
	></textarea>

	<Accordion.Root type="multiple" bind:value={priorityAccordionValue}>
		{#if $parentTasks.status === 'resolved' && $parentTasks.data.length > 0}
			<Accordion.Item value="parent-order">
				<Accordion.Trigger
					class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
				>
					Priority
				</Accordion.Trigger>
				<Accordion.Content>
					<div class="flex flex-col gap-4">
						{#each $parentTasks.data as parent: Task}
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
									class="relative divide-y divide-gray-200 rounded border border-gray-200"
								>
									{#each siblingsByParent.get(parent.id) || [] as sib}
										<li class="flex items-center gap-2 px-2 py-1 text-sm" data-sibling-id={sib.id}>
											{#if sib.id === task.id}
												<div
													class="cursor-grab rounded border border-gray-300 bg-white px-2 py-1 shadow-sm select-none active:cursor-grabbing"
													data-draggable-selected
													title="Drag to reorder within this parent"
												>
													<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 opacity-70" />
													<span>{sib.title}</span>
													<!-- TODO: keyboard reordering -->
												</div>
											{:else}
												<div class="flex-1 opacity-50">{sib.title}</div>
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

		{#if $childTasks.status === 'resolved' && $childTasks.data.length > 0}
			<Accordion.Item value="children">
				<Accordion.Trigger
					class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
				>
					Child Priority
				</Accordion.Trigger>
				<Accordion.Content>
					<ul
						data-children-container
						class="relative divide-y divide-gray-200 rounded border border-gray-200"
					>
						{#each $childTasks.data as child (child.id)}
							<li class="flex items-center gap-2 px-2 py-1 text-sm" data-child-id={child.id}>
								<div
									class="cursor-grab rounded border border-gray-300 bg-white px-2 py-1 shadow-sm select-none active:cursor-grabbing"
									data-child-draggable
									title="Drag to reorder children"
								>
									<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 opacity-70" />
									<span>{child.title}</span>
								</div>
							</li>
						{/each}
					</ul>
				</Accordion.Content>
			</Accordion.Item>
		{/if}
	</Accordion.Root>

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

<style>
	/* Visual drop indicators for sibling items */
	:global(li.drop-indicator-top) {
		box-shadow: inset 0 2px 0 0 rgba(37, 99, 235, 0.7);
	}
	:global(li.drop-indicator-bottom) {
		box-shadow: inset 0 -2px 0 0 rgba(37, 99, 235, 0.7);
	}
	:global(.dnd-insert-indicator) {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: rgba(37, 99, 235, 0.9);
		pointer-events: none;
		display: none;
	}
</style>
