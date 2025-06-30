<script lang="ts">
	import { droppable } from '$lib/actions/dnd';
	import { Task, TaskStatus, type TaskData } from '$lib/DataAPI/Task';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';

	let todaysList = $state<Task[]>([]);
	let suggestedTasks = $state<Task[]>([]);
	let draggedTask = $state<Task | null>(null);

	//TODO: Replace with real task loading logic
	function refreshTasks() {
		//TODO: getTodaysTasks().then(tasks => todaysList = tasks);
		//TODO: getPrioritizedTasks(15).then(topTasks => suggestedTasks = topTasks);
	}

	//TODO: Call refreshTasks on mount
	// refreshTasks();

	function handleTodaysTaskDrop(e: CustomEvent) {
		const task = e.detail.data;
		if (!todaysList.includes(task)) {
			todaysList = [...todaysList, task];
			//TODO: setTodaysTask(task.id, todaysList.indexOf(task));
		}
	}

	function handleSuggestedTaskDrop(e: CustomEvent) {
		const task = e.detail.data;
		todaysList = todaysList.filter((t) => t.id !== task.id);
		//TODO: removeTodaysTask(task);
	}

	function todaysTaskChange(task: Task, changes: Partial<Task>) {
		//TODO: Implement task change logic
		if (changes.completed) {
			//TODO: removeTodaysTask(task);
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
		//TODO: Implement create new project logic
		// let newTask = await createTask(new Task("New Project"));
		// goto(`/tasks/?id=${newTask.id}`);
		alert('Start project (stub)');
	}

	function navigateToTask(task: Task) {
		goto(`/tasks/?id=${task.id}`);
	}

	// Filter completed tasks and duplicates
	let filteredDaysTasks = $derived(
		todaysList.filter((t) => !t.completed).sort((a, b) => (a.title < b.title ? -1 : 1))
	);
	let filteredSuggestedTasks = $derived(
		suggestedTasks.filter((task) => !task.completed && !todaysList.find((t) => task.id === t.id))
	);

	const tasks: Task[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
		(id) =>
			new Task({
				title: id,
				id: id,
				filepath: id,
				created: new Date().toISOString(),
				status: TaskStatus.incomplete //parseInt(id) % 2 == 0 ? TaskStatus.complete : TaskStatus.incomplete
			})
	);
</script>

<div class="page page-todays-tasks">
	<!-- TODO: <HomepageTutorial /> -->
	<!-- TODO: <TasksTutorial /> -->

	<div id="todays-tasks-list">
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

		<ItemList items={filteredDaysTasks} accepts={['task']}>
			{#snippet list(task, index)}
				<TaskListItem {task} />
			{/snippet}
		</ItemList>

		<!-- Pending Tasks -->
		<h2>TODO</h2>
		<ItemList items={tasks.filter((t) => !t.completed)} accepts={['task']}>
			{#snippet list(task, index)}
				<TaskListItem {task} />
			{/snippet}
		</ItemList>

		<!-- Completed Tasks -->
		<h2>TOO DONE</h2>
		<ItemList items={tasks.filter((t) => t.completed)} accepts={['task']}>
			{#snippet list(task, index)}
				<TaskListItem {task} />
			{/snippet}
		</ItemList>
	</div>

	{#if suggestedTasks.length > 0 && todaysList.length < 999}
		<div
			id="suggested-tasks-list"
			use:droppable={{
				accepts: ['task'],
				onDrop: handleSuggestedTaskDrop
			}}
		>
			<h2>Suggested Tasks</h2>
			<ItemList items={filteredSuggestedTasks}>
				{#snippet list(task, index)}
					<TaskListItem {task} />
				{/snippet}
			</ItemList>
		</div>
	{/if}
</div>

<style>
	.page-todays-tasks {
		padding: 1.5em 1em;
	}
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
