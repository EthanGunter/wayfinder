<script lang="ts">
	import Icon from '@iconify/svelte';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import {
		draggable,
		dropTargetForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachClosestEdge,
		extractClosestEdge,
		type Edge
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
	import Button from '$lib/components/ui/button/button.svelte';
	import { getDueDateStatus, getEffectiveDueDate } from '$lib/utils';
	import { appData } from './logic/shared-state';

	type ItemData = { taskId: string; parentId: string; index: number; listId: string };

	function makeItemData(taskId: string, parentId: string, index: number, listId: string): ItemData {
		return { taskId, parentId, index, listId };
	}

	function isItemData(d: any): d is ItemData {
		return (
			!!d &&
			typeof d === 'object' &&
			'taskId' in d &&
			'parentId' in d &&
			'index' in d &&
			'listId' in d &&
			typeof d.taskId === 'string' &&
			typeof d.parentId === 'string' &&
			typeof d.index === 'number' &&
			typeof d.listId === 'string'
		);
	}

	interface Props {
		task: Task;
		parentId: string;
		listType: string;
		index: number;
		isCurrent?: boolean;
		isDraggable?: boolean;
		onSelect?: (taskId: string) => void;
		onDisconnect?: (taskId: string) => void;
	}

	let {
		task,
		parentId,
		listType,
		index,
		isCurrent = false,
		isDraggable = false,
		onSelect,
		onDisconnect
	}: Props = $props();

	let itemEl: HTMLElement | undefined = $state();
	let handleEl: HTMLElement | undefined = $state();
	let containerEl: HTMLElement | undefined = $state();
	let dragHandleEl: HTMLElement | undefined = $state();
	let closestEdge = $state<Edge | null>(null);

	const isCompleted = $derived(isTaskCompleted(task));
	const effectiveDueDate = $derived(getEffectiveDueDate(task/* , appData */));
	const dueDateStatus = $derived(
		getDueDateStatus(effectiveDueDate.dueDate/* , effectiveDueDate.inherited */)
	);

	// Self-managed DnD registration
	$effect(() => {
		if (!itemEl) return;

		const cleanups: (() => void)[] = [];

		if (isDraggable && containerEl && dragHandleEl) {
			cleanups.push(
				draggable({
					element: containerEl,
					dragHandle: dragHandleEl,
					getInitialData: () => makeItemData(task.id, parentId, index, listType)
				})
			);
		}

		cleanups.push(
			dropTargetForElements({
				element: itemEl,
				canDrop: ({ source }) => {
					return (
						isItemData(source.data) &&
						source.data.parentId === parentId &&
						source.data.listId === listType
					);
				},
				getData: ({ element, input }) => {
					return attachClosestEdge(makeItemData(task.id, parentId, index, listType), {
						element,
						input,
						allowedEdges: ['top', 'bottom']
					});
				},
				onDragEnter: ({ source, self }) => {
					const isSource = source.element === (containerEl ?? itemEl);
					if (isSource) {
						closestEdge = null;
						return;
					}
					const edge = extractClosestEdge(self.data);
					if (isItemData(source.data)) {
						const sourceIndex = source.data.index;
						const isItemBeforeSource = index === sourceIndex - 1;
						const isItemAfterSource = index === sourceIndex + 1;
						const isDropIndicatorHidden =
							(isItemBeforeSource && edge === 'bottom') || (isItemAfterSource && edge === 'top');
						if (isDropIndicatorHidden) {
							closestEdge = null;
							return;
						}
					}
					closestEdge = edge;
				},
				onDrag: ({ source, self }) => {
					const isSource = source.element === (containerEl ?? itemEl);
					if (isSource) {
						closestEdge = null;
						return;
					}
					const edge = extractClosestEdge(self.data);
					if (isItemData(source.data)) {
						const sourceIndex = source.data.index;
						const isItemBeforeSource = index === sourceIndex - 1;
						const isItemAfterSource = index === sourceIndex + 1;
						const isDropIndicatorHidden =
							(isItemBeforeSource && edge === 'bottom') || (isItemAfterSource && edge === 'top');
						if (isDropIndicatorHidden) {
							closestEdge = null;
							return;
						}
					}
					closestEdge = edge;
				},
				onDragLeave: () => {
					closestEdge = null;
				},
				onDrop: () => {
					closestEdge = null;
				}
			})
		);

		return () => cleanups.forEach((fn) => fn());
	});
</script>

{#if closestEdge === 'top'}
	<div class="z-10 h-0 w-full outline-1 outline-blue-500"></div>
{/if}
<li
	data-task-id={task.id}
	class="relative flex w-full items-center gap-2 py-[.125rem] text-sm"
	bind:this={itemEl}
>
	<div
		bind:this={containerEl}
		class="w-full rounded border {isDraggable && !isCurrent
			? 'group flex w-full items-center gap-2'
			: 'flex items-center gap-2'} {isDraggable
			? 'border-gray-300 bg-white hover:border-gray-400'
			: 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'} {!isDraggable
			? isCompleted
				? ''
				: 'bg-white'
			: ''}"
	>
		{#if isDraggable}
			<div
				bind:this={dragHandleEl}
				class="cursor-grab px-1 select-none active:cursor-grabbing"
				title="Drag to reorder"
			>
				<Icon icon="lucide:grip-vertical" class="size-3 text-gray-400" />
			</div>
		{/if}
		<button
			bind:this={handleEl}
			class="flex-1 cursor-pointer px-2 py-1 text-left {!isDraggable
				? isCompleted
					? 'text-gray-500'
					: ''
				: ''}"
			title="Select task for editing"
			onclick={() => onSelect?.(task.id)}
		>
			<span class="flex items-center gap-2">
				{task.data.title}
				{#if dueDateStatus.status !== 'none' && !isCompleted}
					<span
						class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs {dueDateStatus.className}"
					>
						{dueDateStatus.text}
					</span>
				{/if}
			</span>
		</button>
		{#if onDisconnect}
			<button
				title="Disconnect task"
				class="flex size-6 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:bg-red-50 hover:text-red-600"
				onclick={() => onDisconnect?.(task.id)}
			>
				<Icon icon="material-symbols:link-off" />
			</button>
		{/if}
	</div>
</li>
{#if closestEdge === 'bottom'}
	<div class="relative z-10 h-0 w-full outline-1 outline-blue-500"></div>
{/if}
