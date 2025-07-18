<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import { Task, TaskStatus, type TaskData } from '$lib/API/Tasks/Task';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';

	// TODO if the user is not synced, offer a "login" & "get started locally" option

	const { data } = $props();
	const api = data.taskAPI;
	const user = data.user;

	let todaysList = $state<Task[]>([]);
	let suggestedTasks = $state<Task[]>([]);

	onMount(async () => {
		refreshTasks();
	});

	function refreshTasks() {
		api.getTodaysTasks().then((tasks) =>
			tasks.match(
				(data) => {
					todaysList = data;
				},
				(err) => {
					err.logError();
				}
			)
		);
		api.getPrioritizedTasks(15).then((result) =>
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
			api.updateTask(task.id, { todays_task: true });
		}
	}

	function handleSuggestedTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;

		todaysList = todaysList.filter((t) => t.id !== task.id);
		api.updateTask(task.id, { todays_task: false });
	}

	function todaysTaskChange(task: Task, changes: Partial<Task>) {
		//TODO: Implement task change logic
		if (changes.completed) {
			api.updateTask(task.id, { todays_task: false });
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
		if (!api) return;

		//TODO: Implement create new project logic
		let newTaskResult = await api.createTask({
			user_id: user.id,
			title: 'New Project',
			status: TaskStatus.incomplete,
			priority: 0
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
	let filteredDaysTasks = $derived(
		todaysList.filter((t) => !t.completed).sort((a, b) => (a.title < b.title ? -1 : 1))
	);
	let filteredSuggestedTasks = $derived(
		suggestedTasks.filter((task) => !task.completed && !todaysList.find((t) => task.id === t.id))
	);
</script>

<div class="page page-todays-tasks">
	<AppHeader user={data.user} />
	<div class="content">
		Logged in as {data.user.display_name ?? 'Anonymous'}
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
					<button id="add-task-button" onclick={startProject}>Start a Project</button>
				</div>
			{/if}

			<ItemList items={filteredDaysTasks}>
				{#snippet listItem(task, index)}
					<TaskListItem {task} />
				{/snippet}
			</ItemList>
		</div>

		{#if todaysList.length < 999}
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
						<TaskListItem {task} />
					{/snippet}
				</ItemList>
			</div>
		{/if}
	</div>
	<AppFooter />
</div>

<style>
	.drop-zone {
		margin-bottom: 2em;
		min-height: 3em;
		padding: 1em;
		border: 2px dashed red;
		&.valid-drop {
			border-color: var(--color-accent, #007acc);
			background-color: var(--background-modifier-hover, #f5f5f5);
		}
		&.invalid-drop {
			border-color: var(--color-accent, #007acc);
			background-color: var(--background-modifier-hover, #f5f5f5);
		}
	}
	#add-task-button {
		padding: 0.7em 1.5em;
		background: var(--color-accent, #007acc);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
</style>
