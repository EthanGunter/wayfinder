<script lang="ts">
	import {
		dropTargetForElements,
		monitorForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import TaskListItem from './TaskListItem.svelte';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import Icon from '@iconify/svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let todaysList = tasksAPI.getTodaysTasks();
	let suggestedTasks = tasksAPI.getPrioritizedTasks(15);

	let todaysDropZoneEl: HTMLElement | undefined = $state();
	let suggestedDropZoneEl: HTMLElement | undefined = $state();
	let isDraggingOverTodays = $state(false);
	let isDraggingOverSuggested = $state(false);
	let isValidDrop = $state(false);

	function isTaskData(data: unknown): data is { type: string; task: Task } {
		return (
			!!data &&
			typeof data === 'object' &&
			'task' in data &&
			'type' in data &&
			(data as any).type === 'task'
		);
	}

	// Set up drop targets
	$effect(() => {
		const cleanups: (() => void)[] = [];

		if (todaysDropZoneEl) {
			cleanups.push(
				dropTargetForElements({
					element: todaysDropZoneEl,
					canDrop: ({ source }) => isTaskData(source.data),
					onDragEnter: () => {
						isDraggingOverTodays = true;
						isValidDrop = true;
					},
					onDragLeave: () => {
						isDraggingOverTodays = false;
						isValidDrop = false;
					},
					onDrop: () => {
						isDraggingOverTodays = false;
						isValidDrop = false;
					}
				})
			);
		}

		if (suggestedDropZoneEl) {
			cleanups.push(
				dropTargetForElements({
					element: suggestedDropZoneEl,
					canDrop: ({ source }) => isTaskData(source.data),
					onDragEnter: () => {
						isDraggingOverSuggested = true;
						isValidDrop = true;
					},
					onDragLeave: () => {
						isDraggingOverSuggested = false;
						isValidDrop = false;
					},
					onDrop: () => {
						isDraggingOverSuggested = false;
						isValidDrop = false;
					}
				})
			);
		}

		return () => cleanups.forEach((fn) => fn());
	});

	// Monitor for drops
	$effect(() => {
		const cleanup = monitorForElements({
			onDrop: async ({ location, source }) => {
				if (!isTaskData(source.data)) return;

				const target = location.current.dropTargets[0];
				if (!target) return;

				const task = source.data.task;

				// Determine which drop zone received the drop
				if (target.element === todaysDropZoneEl) {
					if ($todaysList.status !== 'resolved') return;
					if (!$todaysList.data.includes(task)) {
						await tasksAPI.updateTask({
							id: task.id,
							data: { todaysTask: new Date() }
						});
					}
				} else if (target.element === suggestedDropZoneEl) {
					// Set to yesterday to remove from today's list while preserving historical data
					const yesterday = new Date();
					yesterday.setDate(yesterday.getDate() - 1);
					const [_, error] = await tasksAPI.updateTask({
						id: task.id,
						data: { todaysTask: yesterday }
					});
					if (error) {
						Err.UNHANDLED(error);
					}
				}
			}
		});

		return cleanup;
	});

	async function onTaskChange(task: Task, changes: Partial<Task>) {
		if (changes.children || changes.parents) Err.UNHANDLED('Relational updates not handled');

		const [_, error] = await tasksAPI!.updateTask({ id: task.id, data: changes });
		if (error) {
			Err.UNHANDLED(error);
		}
	}

	// Derive todays sort order from suggested tasks
	let filteredDaysTasks = $derived.by(() => {
		if ($todaysList.status === 'resolved' && $suggestedTasks.status === 'resolved') {
			return $suggestedTasks.data.filter((suggestedTask) =>
				$todaysList.data.some((todaysTask) => todaysTask.id == suggestedTask.id)
			);
		} else return [];
	});

	let completedTodaysTasks = $derived.by(() => {
		if ($todaysList.status === 'resolved') {
			return $todaysList.data.filter((t) => isTaskCompleted(t));
		} else return [];
	});
	let filteredSuggestedTasks = $derived(
		$suggestedTasks.status === 'resolved' && $todaysList.status === 'resolved'
			? $suggestedTasks.data.filter(
					(task) => !isTaskCompleted(task) && !$todaysList.data.find((t) => task.id === t.id)
				)
			: []
	);
</script>

{#if $authState.status === 'signed-in'}
	<AppHeader />

	<div class="page-content mx-auto flex w-full flex-col gap-5 overflow-hidden p-4">
		<div
			bind:this={todaysDropZoneEl}
			class="relative flex flex-1 flex-col overflow-y-auto rounded-xl border-2 p-4 transition-all duration-200 {isDraggingOverTodays &&
			isValidDrop
				? 'border-solid border-green-500 bg-gradient-to-br from-green-50/15 to-green-50/10 shadow-lg'
				: 'border-dashed border-blue-200 bg-gradient-to-br from-blue-100 to-blue-200'}"
		>
			<h1
				class="mb-4 font-semibold text-gray-700 {isDraggingOverTodays && isValidDrop
					? 'text-green-700'
					: ''}"
			>
				Today's Tasks
			</h1>
			{#if filteredDaysTasks.length === 0 && filteredSuggestedTasks.length > 0}
				<h4 class="my-2 text-gray-500 italic">Nothing here. Drag some suggestions in!</h4>
			{/if}
			<div class="flex h-full flex-col gap-2">
				{#each filteredDaysTasks as task, index (task.id)}
					<TaskListItem bind:task={filteredDaysTasks[index]} {onTaskChange} />
				{/each}
				{#if completedTodaysTasks.length > 0}
					<div class=" flex w-full items-center gap-3 px-2 text-xs font-medium text-gray-400">
						<div
							class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"
						></div>
						<div class="flex items-center gap-1.5">
							<span class="tracking-wider uppercase">Completed</span>
							<span>({completedTodaysTasks.length})</span>
						</div>
						<div
							class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"
						></div>
					</div>
					{#each completedTodaysTasks as task, index (task.id)}
						<TaskListItem bind:task={completedTodaysTasks[index]} {onTaskChange} />
					{/each}
				{/if}
			</div>
		</div>
		<div
			class="relative flex min-h-0 flex-1 flex-col rounded-xl border-2 p-4 transition-all duration-200 {isDraggingOverSuggested &&
			isValidDrop
				? 'border-solid border-green-500 bg-gradient-to-br from-green-50/15 to-green-50/10 shadow-lg'
				: 'border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100'}"
		>
			<h2
				class="mb-4 shrink-0 font-semibold text-gray-700 {isDraggingOverSuggested && isValidDrop
					? 'text-green-700'
					: ''}"
			>
				Suggested Tasks
			</h2>
			<div bind:this={suggestedDropZoneEl} class="min-h-0 flex-1 overflow-y-auto">
				{#if filteredSuggestedTasks.length === 0}
					<h4 class="my-2 text-gray-500 italic">There's nothing to suggest!</h4>
				{:else}
					<div class="flex flex-col gap-2">
						{#each filteredSuggestedTasks as task (task.id)}
							<TaskListItem {task} {onTaskChange} />
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	// Pragmatic-dnd provides its own ghost styling, but we can enhance it if needed
	:global([data-is-dragging='true']) {
		opacity: 0.5;
	}
</style>
