<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import TaskListItem from './TaskListItem.svelte';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import * as NavBar from '$lib/components/ui/navbar';

	let todaysList = tasksAPI.getTodaysTasks();
	let suggestedTasks = tasksAPI.getPrioritizedTasks(15);

	async function handleTodaysTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;
		if ($todaysList.status !== 'resolved') return;

		if (!$todaysList.data.includes(task)) {
			await tasksAPI.updateTask({
				id: task.id,
				data: { todaysTask: new Date() }
			});
		}
	}

	async function handleSuggestedTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;

		const [_, error] = await tasksAPI!.updateTask({
			id: task.id,
			data: { todaysTask: undefined }
		});
		if (error) {
			Err.UNHANDLED(error);
		}
	}

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
	<div class="page-content flex w-full flex-col items-center gap-4 overflow-y-scroll p-4">
		<div
			id="todays-tasks-list"
			class="droppable-zone todays-tasks relative min-h-[200px] w-full flex-[2] overflow-y-auto rounded-xl border-2 border-dashed border-blue-200 bg-[linear-gradient(135deg,#dbeafe_0%,#bfdbfe_100%)] p-4 transition-all duration-200 ease-in-out"
			use:droppable={{
				accepts: ['task'],
				onDrop: handleTodaysTaskDrop
			}}
		>
			<h1 class="mb-4 font-semibold text-gray-700">Today's Tasks</h1>
			{#if filteredSuggestedTasks.length > 0}
				<h4 class="my-2 text-gray-500 italic">Nothing here. Drag some suggestions in!</h4>
			{/if}
			<div class="flex flex-col gap-2">
				{#each filteredDaysTasks as task, index (task.id)}
					<TaskListItem bind:task={filteredDaysTasks[index]} {onTaskChange} />
				{/each}
				{#if completedTodaysTasks.length > 0}
					<div
						class="my-1 mb-2 border-t border-dashed border-gray-400 px-2 text-xs text-gray-500"
						aria-hidden="true"
					>
						Completed
					</div>
					{#each completedTodaysTasks as task, index (task.id)}
						<!-- {#each filteredDaysTasks as task, index} -->
						<TaskListItem bind:task={completedTodaysTasks[index]} {onTaskChange} />
					{/each}
				{/if}
			</div>
		</div>
		<div
			id="suggested-tasks-list"
			class="droppable-zone suggested-tasks relative min-h-[150px] w-full flex-1 overflow-y-auto rounded-xl border-2 border-dashed border-gray-200 bg-[linear-gradient(135deg,#f9fafb_0%,#f3f4f6_100%)] p-4 transition-all duration-200 ease-in-out"
			use:droppable={{
				accepts: ['task'],
				onDrop: handleSuggestedTaskDrop
			}}
		>
			<h2 class="mb-4 font-semibold text-gray-700">Suggested Tasks</h2>

			{#if filteredSuggestedTasks.length === 0}
				<h4 class="my-2 text-gray-500 italic">There's nothing to suggest!</h4>
			{/if}

			<div class="flex flex-col gap-2">
				<!-- {#each filteredSuggestedTasks as task} -->
				{#each filteredSuggestedTasks as task (task.id)}
					<TaskListItem {task} {onTaskChange} />
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Pseudo-element overlays for droppable zones */
	.droppable-zone::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: inherit;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%);
		opacity: 0;
		transition: opacity 0.2s ease-in-out;
		pointer-events: none;
	}

	.todays-tasks::before {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%);
	}

	.suggested-tasks::before {
		background: linear-gradient(
			135deg,
			rgba(107, 114, 128, 0.1) 0%,
			rgba(107, 114, 128, 0.05) 100%
		);
	}

	/* Drop zone states during drag */
	:global(.dnd-droppable.valid-drop) {
		border-color: #22c55e !important;
		border-style: solid !important;
		border-width: 3px !important;
		background: linear-gradient(
			135deg,
			rgba(34, 197, 94, 0.15) 0%,
			rgba(34, 197, 94, 0.1) 100%
		) !important;
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.1);
	}

	:global(.dnd-droppable.valid-drop)::before {
		opacity: 1;
	}

	:global(.dnd-droppable.valid-drop h1),
	:global(.dnd-droppable.valid-drop h2) {
		color: #059669;
	}

	:global(.dnd-droppable.invalid-drop) {
		border-color: #9ca3af !important;
		border-style: solid !important;
		border-width: 3px !important;
		background: linear-gradient(
			135deg,
			rgba(156, 163, 175, 0.15) 0%,
			rgba(156, 163, 175, 0.1) 100%
		) !important;
	}

	:global(.dnd-droppable.invalid-drop h1),
	:global(.dnd-droppable.invalid-drop h2) {
		color: #6b7280;
	}

	/* Enhanced ghost styling */
	:global(.dnd-ghost) {
		opacity: 0.8;
		transform: rotate(3deg);
		border: 2px solid #3b82f6;
		border-radius: 8px;
		box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(4px);
	}

	:global(.dnd-ghost.valid-drop) {
		border-color: #22c55e;
		box-shadow: 0 10px 30px rgba(34, 197, 94, 0.3);
	}

	:global(.dnd-ghost.invalid-drop) {
		border-color: #ef4444;
		box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
		transform: rotate(3deg) scale(0.95);
	}

	/* Draggable feedback */
	:global(.dnd-draggable:active) {
		transform: scale(1.02);
	}
</style>
