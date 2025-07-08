<script lang="ts">
	import { type Task } from '$lib/DataAPI/Task';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import { type ITaskStorage } from '$lib/DataAPI/types';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import { BrowserTaskStorage } from '$lib/DataAPI/BrowserTaskStorage';

	//TODO: Replace with real task loading logic (from store, API, etc.)
	let API = $state<Promise<ITaskStorage>>(BrowserTaskStorage.get());
	let currentTask = $state<Task | null>(null);
	let dependencies = $state<Task[]>([]);
	let dependants = $state<Task[]>([]);

	//TODO: Implement real query param reading and task fetching
	$effect(() => {
		const id = page.url.searchParams.get('id');
		if (id) fetchCurrentTask(id);
		else {
			currentTask = null;
			fetchRootTasks();
		}
	});

	async function fetchCurrentTask(id: string) {
		const api = await API;

		//TODO: Fetch currentTask, children, and parents based on id
		(await api.readTask(id)).match(
			(task) => {
				currentTask = task;
			},
			(err) => {
				console.error(err);
			}
		);
		(await api.getDependants(id)).match(
			(deps) => {
				dependants = deps;
			},
			(err) => {
				console.error(err);
			}
		);
		(await api.getDependencies(id)).match(
			(deps) => {
				dependencies = deps;
			},
			(err) => {
				console.error(err);
			}
		);
	}
	async function fetchRootTasks() {
		const api = await API;

		(await api.getRootTasks()).match(
			(roots) => {
				dependencies = roots;
			},
			(err) => {
				console.error(err);
			}
		);
	}

	function gotoTask(id: string) {
		goto(`tasks?id=${id}`);
	}

	async function addTask() {
		const api = await API;
		if (currentTask) {
			(await api.createTask({ title: 'New Subtask', dependant: currentTask.id })).match(
				(newID) => {
					fetchCurrentTask(newID);
				},
				(err) => {
					console.error(err);
				}
			);
		} else {
			(await api.createTask({ title: 'New Project' })).match(
				(newID) => {
					fetchCurrentTask(newID);
				},
				(err) => {
					console.error(err);
				}
			);
		}
	}

	async function onTaskChange() {
		// TODO: Do some debouncing to save on server calls
		API.then((api) => {
			if (currentTask) {
				api.updateTask(currentTask.id, currentTask);
			}
		});
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
			{#if dependants.length > 0}
				{#each dependants as parent}
					<button class="task-browser-parent-button" onclick={() => gotoTask(parent.id)}>
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
		<TaskEditor bind:task={currentTask} {onTaskChange}>
			<ItemList items={dependencies}>
				{#snippet listItem(task, index)}
					<TaskListItem {task} />
				{/snippet}
			</ItemList>
		</TaskEditor>
		<button id="add-task-button" onclick={addTask}>Add Task</button>
	{:else}
		<ItemList items={dependencies}>
			{#snippet listItem(task, index)}
				<TaskListItem {task} />
			{/snippet}
		</ItemList>
		<button id="add-task-button" onclick={addTask}>New Project</button>
	{/if}
</section>

<style>
	.task-browser.page {
		display: flex;
		padding: 1.5em 1em;
	}
	.task-browser-header {
		display: flex;
		gap: 0.5em;
		align-items: center;
		margin-bottom: 1em;
	}
	#add-task-button {
		margin-top: auto;
	}
</style>
