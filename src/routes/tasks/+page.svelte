<script lang="ts">
	import TaskList from '$lib/components/TaskList.svelte';
	import type { Task } from '$lib/DataAPI/Task';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	//TODO: Replace with real task loading logic (from store, API, etc.)
	let tasks = $state<Task[]>([]);
	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

	//TODO: Implement real query param reading and task fetching
	$effect(() => {
		const id = page.url.searchParams.get('id');
		//TODO: Fetch currentTask, children, and parents based on id
		// For now, just clear currentTask and show empty list
		currentTask = null;
		children = [];
		parents = [];
	});

	function addTask() {
		//TODO: Implement add task/subtask logic
		alert('Add task (stub)');
	}

	function goToParent(parentId: string) {
		//TODO: Implement navigation to parent task
		// Use $app/navigation's goto with updated search param
	}
</script>

<section class="task-browser page">
	<!-- TODO: <TasksTutorial /> -->
	{#if currentTask}
		<div class="task-browser-header">
			<button class="task-browser-back-button" onclick={() => history.back()}>
				<!-- TODO: Replace with real icon -->
				<span>⬅️</span>
			</button>
			{#if parents.length > 0}
				{#each parents as parent}
					<button class="task-browser-parent-button" onclick={() => goToParent(parent.id)}>
						<!-- TODO: Replace with real icon -->
						<span>⬆️</span>
						{parent.title}
					</button>
				{/each}
			{:else}
				<button onclick={() => goto('/tasks')}>
					<!-- Go to root -->
					<span>⬆️</span>
					Projects
				</button>
			{/if}
		</div>
		<!-- TODO: <TaskEditor task={currentTask}> -->
		<TaskList tasks={children} />
		<button id="add-task-button" onclick={addTask}>Add Task</button>
		<!-- </TaskEditor> -->
	{:else}
		<TaskList tasks={children} />
		<button id="add-task-button" onclick={addTask}>New Project</button>
	{/if}
</section>

<style>
	.task-browser.page {
		padding: 1.5em 1em;
	}
	.task-browser-header {
		display: flex;
		gap: 0.5em;
		align-items: center;
		margin-bottom: 1em;
	}
</style>
