<script lang="ts">
	import Icon from '@iconify/svelte';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import {
		draggable,
		dropTargetForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachClosestEdge,
		type Edge as ClosestEdge
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';

	type ItemData = { taskId: string; parentId: string; index: number; listType: 'sibling' | 'child' };
	const ITEM_KEY = Symbol('item');

	function makeItemData(
		taskId: string,
		parentId: string,
		index: number,
		listType: ItemData['listType']
	): ItemData & { [ITEM_KEY]: true } {
		return { [ITEM_KEY]: true, taskId, parentId, index, listType };
	}

	function isItemData(d: unknown): d is ItemData & { [ITEM_KEY]: true } {
		return !!d && typeof d === 'object' && (d as any)[ITEM_KEY] === true;
	}

	interface Props {
		task: Task;
		parentId: string;
		listType: 'sibling' | 'child';
		index: number;
		isCurrent?: boolean;
		isDraggable?: boolean;
		onHighlight?: (taskId: string) => void;
	}

	let {
		task,
		parentId,
		listType,
		index,
		isCurrent = false,
		isDraggable = false,
		onHighlight
	}: Props = $props();

	let itemEl: HTMLElement | undefined = $state();
	let handleEl: HTMLElement | undefined = $state();

	const isCompleted = $derived(isTaskCompleted(task));

	// Self-managed DnD registration
	$effect(() => {
		if (!itemEl || !isDraggable) return;

		const cleanups: (() => void)[] = [];

		// Register as draggable (with drag handle if available)
		cleanups.push(
			draggable({
				element: handleEl ?? itemEl,
				getInitialData: () => makeItemData(task.id, parentId, index, listType)
			})
		);

		// Register as drop target
		cleanups.push(
			dropTargetForElements({
				element: itemEl,
				canDrop: ({ source }) =>
					isItemData(source.data) &&
					source.data.parentId === parentId &&
					source.data.listType === listType,
				getData: ({ element, input }) =>
					attachClosestEdge(makeItemData(task.id, parentId, index, listType), {
						element,
						input,
						allowedEdges: ['top', 'bottom']
					})
			})
		);

		return () => cleanups.forEach((fn) => fn());
	});
</script>

<li class="flex items-center gap-2 px-2 py-1 text-sm" bind:this={itemEl}>
	{#if isCurrent}
		<!-- Current task: draggable with grip, clickable to center -->
		<button
			bind:this={handleEl}
			class="flex-1 cursor-grab rounded border border-gray-300 bg-white px-2 py-1 text-left select-none hover:border-gray-400 active:cursor-grabbing"
			title="Drag to reorder | Click to center in graph"
			onclick={() => onHighlight?.(task.id)}
		>
			<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 text-gray-400" />
			<span>{task.title}</span>
		</button>
	{:else if isDraggable}
		<!-- Other draggable item: clickable with grip + locate button on hover -->
		<div class="group flex flex-1 items-center gap-2">
			<button
				bind:this={handleEl}
				class="flex-1 cursor-grab rounded border border-gray-300 bg-white px-2 py-1 text-left select-none hover:border-gray-400 active:cursor-grabbing"
				title="Drag to reorder | Click to center in graph"
				onclick={() => onHighlight?.(task.id)}
			>
				<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 text-gray-400" />
				<span>{task.title}</span>
			</button>
		</div>
	{:else}
		<!-- Non-draggable (completed or sibling): clickable or with locate button -->
		{#if !isCurrent}
			<button
				class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-500 hover:cursor-pointer hover:border-blue-300 hover:bg-blue-50"
				onclick={() => onHighlight?.(task.id)}
				title="Center this task in graph view"
			>
				<span class="ml-5">{task.title}</span>
			</button>
		{:else}
			<div class="group flex flex-1 items-center gap-2">
				<div class="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500">
					<span class="ml-5">{task.title}</span>
				</div>
			</div>
		{/if}
	{/if}
</li>

