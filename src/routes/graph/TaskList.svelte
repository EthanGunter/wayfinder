<script lang="ts">
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
	import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
	import TaskListItem from './TaskListItem.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import Icon from '@iconify/svelte';

	interface Props {
		tasks: Task[];
		parentId: string;
		id: string;
		title?: string;
		currentTaskId?: string;
		onHighlight: (id: string) => void;
		onReorder: (taskId: string, startIndex: number, finishIndex: number) => void;
		showCompleted: boolean;
	}

	let { tasks, parentId, id, title, currentTaskId, onHighlight, onReorder, showCompleted }: Props =
		$props();

	// Sort tasks into incomplete and complete
	const sorted = $derived.by(() => {
		const incomplete = tasks.filter((t) => !isTaskCompleted(t));
		const complete = tasks.filter((t) => isTaskCompleted(t));
		return { incomplete, complete };
	});

	// Determine if a task is draggable
	function isDraggable(task: Task): boolean {
		if (currentTaskId !== undefined) {
			return task.id === currentTaskId;
		}
		return !isTaskCompleted(task);
	}

	// ItemData type (shared with TaskListItem)
	type ItemData = {
		taskId: string;
		parentId: string;
		index: number;
		listId: string;
	};

	function isItemData(d: unknown): d is ItemData {
		return (
			!!d &&
			typeof d === 'object' &&
			'taskId' in d &&
			'parentId' in d &&
			'index' in d &&
			'listId' in d &&
			typeof (d as any).taskId === 'string' &&
			typeof (d as any).parentId === 'string' &&
			typeof (d as any).index === 'number' &&
			typeof (d as any).listId === 'string'
		);
	}

	// Set up drop monitoring for this list only
	$effect(() => {
		const cleanup = monitorForElements({
			canMonitor: ({ source }) => {
				return isItemData(source.data) && source.data.listId === id;
			},
			onDrop: ({ location, source }) => {
				const target = location.current.dropTargets[0];
				if (!target) return;
				const src = source.data;
				const dst = target.data;
				if (!isItemData(src) || !isItemData(dst)) return;
				if (src.listId !== dst.listId || src.parentId !== dst.parentId) return;

				const closest = extractClosestEdge(dst);
				const finishIndex = getReorderDestinationIndex({
					startIndex: src.index,
					indexOfTarget: dst.index,
					closestEdgeOfTarget: closest,
					axis: 'vertical'
				});

				onReorder(src.taskId, src.index, finishIndex);
			}
		});

		return cleanup;
	});
</script>

<div>
	{#if title}
		<button
			class="w-fit rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-sm text-gray-700 hover:cursor-pointer hover:bg-gray-100"
			onclick={() => onHighlight(parentId)}
		>
			<h2>{title}</h2>
		</button>
	{/if}
	<div
		class="relative rounded-md border border-gray-200 bg-gray-50 {title ? ' rounded-tl-none' : ''}"
	>
		<ul class="flex flex-col p-1">
			{#each sorted.incomplete as task, index (task.id)}
				<TaskListItem
					{task}
					{parentId}
					listType={id}
					{index}
					isCurrent={currentTaskId === task.id}
					isDraggable={isDraggable(task)}
					{onHighlight}
				/>
			{/each}
		</ul>
		{#if sorted.complete.length > 0}
			<Collapsible.Root bind:open={showCompleted}>
				<Collapsible.Trigger
					class="flex w-full items-center gap-3 px-2 text-xs font-medium text-gray-400 hover:cursor-pointer hover:text-gray-600 {showCompleted
						? 'pt-3 pb-1'
						: 'py-2'}"
				>
					<div class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"></div>
					<div class="flex items-center gap-1.5">
						<Icon
							icon="lucide:chevron-right"
							class="size-3 transition-transform {showCompleted ? 'rotate-90' : ''}"
						/>
						<span class="tracking-wider uppercase">Completed</span>
						<span>({sorted.complete.length})</span>
					</div>
					<div class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"></div>
				</Collapsible.Trigger>
				<Collapsible.Content>
					<ul class="flex flex-col p-1">
						{#each sorted.complete as task, index (task.id)}
							<TaskListItem
								{task}
								{parentId}
								listType={id}
								index={sorted.incomplete.length + index}
								isCurrent={currentTaskId === task.id}
								isDraggable={false}
								{onHighlight}
							/>
						{/each}
					</ul>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
</div>
