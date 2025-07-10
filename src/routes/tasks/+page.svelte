<script lang="ts">
	import { type Task } from '$lib/DataAPI/Task';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import { type ITaskStorage } from '$lib/DataAPI/types';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import { BrowserTaskStorage } from '$lib/DataAPI/BrowserTaskStorage';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';

	let API = $state<Promise<ITaskStorage>>(BrowserTaskStorage.get());
	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

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
		(await api.getparents(id)).match(
			(deps) => {
				parents = deps;
			},
			(err) => {
				console.error(err);
			}
		);
		(await api.getChildren(id)).match(
			(deps) => {
				children = deps;
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
				children = roots;
			},
			(err) => {
				console.error(err);
			}
		);
	}

	async function addTask() {
		const api = await API;
		if (currentTask) {
			(await api.createTask({ title: 'New Subtask', parent: currentTask.id })).match(
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

	async function onTaskChange(update: Partial<Task>) {
		// TODO: Do some debouncing to save on server calls
		API.then((api) => {
			if (currentTask) {
				console.log(update);
				api.updateTask(currentTask.id, update);
			}
		});
	}
</script>

<AppHeader />
<section class="task-browser page">
	<!-- TODO: <TasksTutorial /> -->
	{#if currentTask}
		<div class="navigation">
			<a class="breadcrumb-link" href="/tasks">
				<!-- Go to root -->
				Projects
			</a>
			{#if parents.length > 0}
				{#each parents as parent, index}
					>
					<a class="breadcrumb-link" href={`/tasks?id=${parent.id}`}>
						<!-- TODO: Replace with real icon -->
						{parent.title ?? 'Projects'}
					</a>
				{/each}
			{/if}
		</div>
		<TaskEditor bind:task={currentTask} {onTaskChange}>
			<ItemList items={children}>
				{#snippet listItem(task, index)}
					<TaskListItem {task} />
				{/snippet}
			</ItemList>
		</TaskEditor>
		<button id="add-task-button" onclick={addTask}>Add Task</button>
	{:else}
		<ItemList items={children}>
			{#snippet listItem(task, index)}
				<TaskListItem {task} />
			{/snippet}
		</ItemList>
		<button id="add-task-button" onclick={addTask}>New Project</button>
	{/if}
</section>
<AppFooter />

<style>
	.task-browser.page {
		display: flex;
		padding: 1.5em 1em;
	}
	.navigation {
		display: flex;
		gap: 0.5em;
		align-items: center;
		margin-bottom: 1em;

		color: #0005;
		font-size: small;

		a {
			text-decoration: none;
			color: var(--c-text_2);
			border: 1px solid #0003;
			border-radius: 0.25rem;
			padding: 0.2rem 0.5rem;
			&:hover {
				background-color: #0001;
			}
		}
	}
	#add-task-button {
		margin-top: auto;
	}
</style>
