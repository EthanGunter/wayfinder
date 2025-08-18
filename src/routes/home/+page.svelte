<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import { Task, TaskStatus, type TaskData } from '$lib/API/Tasks/Task';
	import { goto, invalidateAll } from '$app/navigation';

	import TaskListItem from './TaskListItem.svelte';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { isAnonymous, type User } from '$lib/API/Auth/User.js';
	import { Button } from '@/components/ui/button';
	import { type ILocalAuth } from '@/API/Auth/types';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import type { ILocalTasks } from '@/API/Tasks';
	import { page } from '$app/state';
	import { redirect } from '@sveltejs/kit';
	import { Err } from '@/Errors';

	let auth = $state<ILocalAuth>();
	let tasks = $state<ILocalTasks>();
	let user = $state<User>();

	let todaysList = $state<Task[]>([]);
	let suggestedTasks = $state<Task[]>([]);

	onMount(async () => {
		tasks = await taskAPIPromise;

		auth = await authAPIPromise;
		const active = await auth.getActiveUser();
		if (!active) {
			goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			return;
		}
		user = active;

		refreshTasks();
	});

	function refreshTasks() {
		tasks!.getTodaysTasks().then((tasks) =>
			tasks.match(
				(data) => {
					todaysList = data;
				},
				(err) => {
					err.logError();
				}
			)
		);
		tasks!.getPrioritizedTasks(15).then((result) =>
			result.match(
				(tasks) => {
					suggestedTasks = tasks;
				},
				(err) => {
					err.logError();
				}
			)
		);
	}

	function handleTodaysTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;

		if (!todaysList.includes(task)) {
			todaysList = [...todaysList, task];
			tasks!.updateTask({ taskOrId: task, changes: { todays_task: true } });
		}
	}

	function handleSuggestedTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;

		todaysList = todaysList.filter((t) => t.id !== task.id);
		tasks!.updateTask({ taskOrId: task, changes: { todays_task: false } });
	}

	async function handleTaskComplete(task: Task, status: TaskStatus) {
		tasks!.updateTask({ taskOrId: task, changes: { status } });
	}

	async function startProject() {
		if (!tasks) return;

		//TODO: Implement create new project logic
		let newTaskResult = await tasks.createTask({
			createDetail: {
				user_id: user!.id,
				title: 'New Project',
				status: TaskStatus.incomplete,
				priority: 0
			}
		});
		newTaskResult.match(
			(newTask) => {
				goto(`/tasks/?id=${newTask.id}`);
			},
			(err) => {
				err.logError();
			}
		);
		// alert('Start project (stub)');
	}

	// Filter completed tasks and duplicates
	// let filteredDaysTasks = $derived(
	// 	todaysList.filter((t) => !t.completed).sort((a, b) => (a.title < b.title ? -1 : 1))
	// );
	let filteredSuggestedTasks = $derived(
		suggestedTasks.filter((task) => !task.completed && !todaysList.find((t) => task.id === t.id))
	);

	// Check if user has any tasks at all
	let hasAnyTasks = $derived(todaysList.length > 0 || suggestedTasks.length > 0);
</script>

{#if auth && user && tasks}
	<div class="page page-root">
		<AppHeader class="grid-area-header z-10 h-16">{#snippet center()}{/snippet}</AppHeader>
		<div
			class="grid-area-content mx-auto flex w-full max-w-[35rem] min-w-80 flex-col overflow-hidden p-4"
		>
			{#if isAnonymous(user) && !hasAnyTasks}
				<div
					class="mt-12 flex flex-col gap-4 rounded-lg border border-gray-300 bg-gray-50 p-8 text-center"
				>
					<h3 class="m-0 mb-2 text-2xl text-gray-800">Welcome to Wayfinder!</h3>
					<Button id="add-task-button" onclick={startProject}>Start a Project</Button>
				</div>
				<!-- TODO:TEMP  -->
				{#if false}
					<p class="m-0 text-sm text-gray-500 italic">Or sign in to sync your data.</p>
					<Button
						class="border border-gray-400 bg-transparent text-gray-800 transition-all duration-200 ease-in-out hover:border-gray-600 hover:bg-gray-100"
						onclick={() => goto('/login')}
					>
						Sign In
					</Button>
					<Button
						class="border-blue-500 bg-blue-500 text-white transition-all duration-200 ease-in-out hover:-translate-y-1 hover:border-blue-600 hover:bg-blue-600 hover:shadow-[0_4px_12px_rgba(0,122,204,0.3)]"
						onclick={() => goto('/register')}
					>
						Create Account
					</Button>
				{/if}
			{:else}
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
						{#if todaysList.length === 0}
							<h4>Empty todolist!</h4>
						{/if}
						{#if filteredSuggestedTasks.length > 0}
							<h4>Drag some suggestions in!</h4>
						{/if}
						{#if suggestedTasks.length === 0 && todaysList.length === 0}
							<div>
								<br />
								<Button id="add-task-button" onclick={startProject}>Start a Project</Button>
							</div>
						{/if}

						<div class="tasks-list">
							{#each todaysList as task, index (task.id)}
								<TaskListItem
									bind:task={todaysList[index]}
									onTaskComplete={handleTaskComplete}
								/>
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
						<div class="tasks-list">
							{#each filteredSuggestedTasks as task (task.id)}
								<TaskListItem {task} onTaskComplete={handleTaskComplete} />
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
		<AppFooter className="h-16 grid-area-footer z-10" />
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

		// Hover state
		&:hover {
			background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
			border-color: #cbd5e1;
		}
	}

	.todays-tasks {
		border-color: #dbeafe;
		background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
		flex: 2; // Priority - takes 2/3 of available space
		min-height: 200px;

		&:hover {
			background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
			border-color: #3b82f6;
		}

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

		&:hover {
			background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
			border-color: #9ca3af;
		}

		&::before {
			background: linear-gradient(
				135deg,
				rgba(107, 114, 128, 0.1) 0%,
				rgba(107, 114, 128, 0.05) 100%
			);
		}
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
