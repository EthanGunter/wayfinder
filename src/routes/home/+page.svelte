<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import { Task, TaskStatus, type TaskData } from '$lib/API/Tasks/Task';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
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

	// TODO: Add auth redirect logic here if this route requires authentication
	// TODO if the user is not synced, offer a "login" & "get started locally" option

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

	function todaysTaskChange(task: Task, changes: Partial<Task>) {
		//TODO: Implement task change logic
		if (changes.completed) {
			tasks!.updateTask({ taskOrId: task, changes: { todays_task: false } });
			todaysList = todaysList.filter((t) => t.id !== task.id);
		}
	}

	function suggestedTaskChange(task: Task, changes: Partial<Task>) {
		//TODO: Implement suggested task change logic
		if (changes.completed) {
			suggestedTasks = suggestedTasks.filter((t) => t.id !== task.id);
		}
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

	async function handleDeleteTask(task: Task, source: 'today' | 'suggested') {
		// TODO: Add recursive delete UI
		const deleteRes = await tasks!.deleteTask({ taskOrId: task, recursive: false });
		if (deleteRes.isOk()) {
			if (source === 'today') {
				todaysList = todaysList.filter((t) => t.id !== task.id);
			} else {
				suggestedTasks = suggestedTasks.filter((t) => t.id !== task.id);
			}
		}
	}

	// Filter completed tasks and duplicates
	let filteredDaysTasks = $derived(
		todaysList.filter((t) => !t.completed).sort((a, b) => (a.title < b.title ? -1 : 1))
	);
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
			class="grid-area-content mx-auto flex w-full max-w-[35rem] min-w-80 flex-col items-center gap-4 overflow-y-scroll p-4"
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
				<div
					id="todays-tasks-list"
					use:droppable={{
						accepts: ['task'],
						onDrop: handleTodaysTaskDrop
					}}
				>
					<h1>Today's Tasks</h1>
					{#if filteredDaysTasks.length === 0}
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

					<ItemList items={filteredDaysTasks}>
						{#snippet listItem(task, index)}
							<TaskListItem {task} onDelete={(task) => handleDeleteTask(task, 'today')} />
						{/snippet}
					</ItemList>
				</div>
				<div
					id="suggested-tasks-list"
					use:droppable={{
						accepts: ['task'],
						onDrop: handleSuggestedTaskDrop
					}}
				>
					<h2>Suggested Tasks</h2>
					<ItemList items={filteredSuggestedTasks}>
						{#snippet listItem(task, index)}
							<TaskListItem {task} onDelete={(task) => handleDeleteTask(task, 'suggested')} />
						{/snippet}
					</ItemList>
				</div>
			{/if}
		</div>
		<AppFooter className="h-16 grid-area-footer z-10" />
	</div>
{/if}
