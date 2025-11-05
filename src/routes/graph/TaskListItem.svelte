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
				canDrop: ({ source }) => {
					if (!isItemData(source.data)) {
						return false;
					}
					return source.data.parentId === parentId && source.data.listId === listType;
				},
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

<li class="flex w-full items-center gap-2 text-sm" bind:this={itemEl}>
	<div class="w-full {isDraggable && !isCurrent ? 'group flex w-full items-center gap-2' : ''}">
		<button
			bind:this={handleEl}
			class="w-full rounded border px-2 py-1 text-left {isDraggable
				? 'cursor-grab border-gray-300 bg-white select-none hover:border-gray-400 active:cursor-grabbing'
				: 'border-gray-200 hover:cursor-pointer hover:border-blue-300 hover:bg-blue-50'} 
				{!isDraggable ? (isCompleted ? 'text-gray-500' : 'bg-white') : ''}"
			title={isDraggable
				? 'Drag to reorder | Click to center in graph'
				: 'Center this task in graph view'}
			onclick={() => onHighlight?.(task.id)}
		>
			{#if isDraggable}
				<Icon icon="lucide:grip-vertical" class="mr-1 inline size-3 text-gray-400" />
			{/if}
			<span>{task.title}</span>
		</button>
	</div>
</li>
