<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import TaskListItem from './TaskListItem.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { Button } from '$lib/components/ui/button';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, type Task } from '$domain/models/task';

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

	// Filter completed tasks and duplicates
	let filteredDaysTasks = $derived(
		// TODO:UX this should sort by priority, but the tasks' priorities are not related to each other... Today's tasks need their own local priority :(
		$todaysList.status === 'resolved'
			? $todaysList.data.sort((a, b) => {
					const ac = isTaskCompleted(a);
					const bc = isTaskCompleted(b);

					// If both or neither are completed, sort by title
					if ((ac && bc) || !(ac || bc)) return a.title < b.title ? -1 : 1;
					// Otherwise move completed lower
					else if (isTaskCompleted(a)) return 1;
					else return -1;
				})
			: []
	);
	let firstCompletedIndex = $derived(filteredDaysTasks.findIndex((t) => isTaskCompleted(t)));
	let filteredSuggestedTasks = $derived(
		$suggestedTasks.status === 'resolved' && $todaysList.status === 'resolved'
			? $suggestedTasks.data.filter(
					(task) => !isTaskCompleted(task) && !$todaysList.data.find((t) => task.id === t.id)
				)
			: []
	);
</script>

{#if $authState.status === 'signed-in'}
	<div class="page page-root">
		<AppHeader class="grid-area-header z-10 h-16">{#snippet center()}{/snippet}</AppHeader>
		<div
			class="grid-area-content mx-auto flex w-full max-w-[35rem] min-w-80 flex-col overflow-hidden p-4"
		>
			<div class="drop-zones-container">
				<div
					id="todays-tasks-list"
					class="droppable-zone todays-tasks"
					use:droppable={{
						accepts: ['task'],
						onDrop: handleTodaysTaskDrop
					}}
				>
					<h1>Today's Tasks</h1>
					{#if filteredSuggestedTasks.length > 0}
						<h4>Nothing here. Drag some suggestions in!</h4>
					{/if}
					<div class="tasks-list">
						{#each filteredDaysTasks as task, index (task.id)}
							<!-- {#each filteredDaysTasks as task, index} -->
							{#if index === firstCompletedIndex && firstCompletedIndex !== -1}
								<div class="completed-separator" aria-hidden="true">Completed</div>
							{/if}
							<TaskListItem bind:task={filteredDaysTasks[index]} {onTaskChange} />
						{/each}
					</div>
				</div>
				<div
					id="suggested-tasks-list"
					class="droppable-zone suggested-tasks"
					use:droppable={{
						accepts: ['task'],
						onDrop: handleSuggestedTaskDrop
					}}
				>
					<h2>Suggested Tasks</h2>

					{#if filteredSuggestedTasks.length === 0}
						<h4>There's nothing to suggest!</h4>
					{/if}

					<div class="tasks-list">
						<!-- {#each filteredSuggestedTasks as task} -->
						{#each filteredSuggestedTasks as task (task.id)}
							<TaskListItem {task} {onTaskChange} />
						{/each}
					</div>
				</div>
			</div>
		</div>
		<AppFooter className="grid-area-footer z-10" />
	</div>
{/if}

<style lang="scss">
	.drop-zones-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: 1rem;
		flex: 1;
	}

	.tasks-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.droppable-zone {
		padding: 1rem;
		border: 2px dashed transparent;
		border-radius: 12px;
		background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
		transition: all 0.2s ease-in-out;
		position: relative;
		overflow-y: auto;

		&::before {
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

		h1,
		h2 {
			margin-bottom: 1rem;
			color: #374151;
			font-weight: 600;
		}

		h4 {
			color: #6b7280;
			font-style: italic;
			margin: 0.5rem 0;
		}
	}

	.todays-tasks {
		border-color: #dbeafe;
		background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
		flex: 2; // Priority - takes 2/3 of available space
		min-height: 200px;

		&::before {
			background: linear-gradient(
				135deg,
				rgba(59, 130, 246, 0.1) 0%,
				rgba(59, 130, 246, 0.05) 100%
			);
		}
	}

	.suggested-tasks {
		border-color: #e5e7eb;
		background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
		flex: 1; // Takes 1/3 of available space
		min-height: 150px;

		&::before {
			background: linear-gradient(
				135deg,
				rgba(107, 114, 128, 0.1) 0%,
				rgba(107, 114, 128, 0.05) 100%
			);
		}
	}

	.completed-separator {
		margin: 0.25rem 0 0.5rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		color: #6b7280;
		border-top: 1px dashed #9ca3af;
	}

	// Drop zone states during drag
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

		&::before {
			opacity: 1;
		}

		h1,
		h2 {
			color: #059669;
		}
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

		h1,
		h2 {
			color: #6b7280;
		}
	}

	// Enhanced ghost styling
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

	// Draggable feedback - simplified to avoid z-fighting
	:global(.dnd-draggable:active) {
		transform: scale(1.02);
	}
</style>
