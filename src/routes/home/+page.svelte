<script lang="ts">
	import { DropEvent, droppable } from '$lib/actions/dnd';
	import { Task, TaskStatus, type TaskData } from '$lib/API/Tasks/Task';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { isAnonymous } from '$lib/API/Auth/User.js';

	// TODO: Add auth redirect logic here if this route requires authentication
	// TODO if the user is not synced, offer a "login" & "get started locally" option

	const { data } = $props();
	const auth = data.auth;
	const tasks = data.tasks;
	const user = data.user;

	let todaysList = $state<Task[]>([]);
	let suggestedTasks = $state<Task[]>([]);

	onMount(async () => {
		refreshTasks();
	});

	function refreshTasks() {
		tasks.getTodaysTasks().then((tasks) =>
			tasks.match(
				(data) => {
					todaysList = data;
				},
				(err) => {
					err.logError();
				}
			)
		);
		tasks.getPrioritizedTasks(15).then((result) =>
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
			tasks.updateTask({ taskOrId: task, changes: { todays_task: true } });
		}
	}

	function handleSuggestedTaskDrop(e: DropEvent<Task>) {
		const task = e.detail.data;
		if (!task) return;

		todaysList = todaysList.filter((t) => t.id !== task.id);
		tasks.updateTask({ taskOrId: task, changes: { todays_task: false } });
	}

	function todaysTaskChange(task: Task, changes: Partial<Task>) {
		//TODO: Implement task change logic
		if (changes.completed) {
			tasks.updateTask({ taskOrId: task, changes: { todays_task: false } });
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
				user_id: user.id,
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
		const deleteRes = await tasks.deleteTask({ taskOrId: task, recursive: false });
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

<div class="page page-todays-tasks">
	<AppHeader user={data.user} authAPI={auth} />
	<div class="content">
		{#if isAnonymous(user) && !hasAnyTasks}
			<div class="auth-options">
				<h3>Welcome to Wayfinder!</h3>
				<button id="add-task-button" onclick={startProject}>Start a Project</button>
			</div>
			<p class="auth-note">Or sign in to sync your data.</p>
			<button class="btn-secondary" onclick={() => goto('/login')}> Sign In </button>
			<button class="btn-primary" onclick={() => goto('/login?register')}> Create Account </button>
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
						<button id="add-task-button" onclick={startProject}>Start a Project</button>
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

	.auth-options {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		margin-top: 3rem;
		padding: 2rem;
		background: var(--background-modifier-hover, #f8f9fa);
		border-radius: 8px;
		text-align: center;
		border: 1px solid var(--color-border, #e1e5e9);
	}

	.auth-message h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text, #333);
		font-size: 1.5rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		/* display: inline-block; */
	}

	.btn-primary {
		background: var(--color-accent, #007acc);
		color: white;
	}

	.btn-primary:hover {
		background: var(--color-accent-hover, #005a9e);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 122, 204, 0.3);
	}

	.btn-secondary {
		background: transparent;
		color: var(--color-text, #333);
		border: 1px solid var(--color-border, #ccc);
	}

	.btn-secondary:hover {
		background: var(--background-modifier-hover, #f0f0f0);
		border-color: var(--color-border-hover, #999);
	}

	.auth-note {
		margin: 0;
		color: var(--color-text-tertiary, #888);
		font-size: 0.9rem;
		font-style: italic;
	}
</style>
