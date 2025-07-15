<script lang="ts">
	import { type Task } from '$lib/API/Tasks/Task';
	import { page } from '$app/state';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import api from '$lib/API/Tasks';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { redirect } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import debounce from '$lib/debounce';

	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

	const debouncedUpdate = debounce(api.updateTask, 500);

	// TODO: Implement real query param reading and task fetching
	$effect(() => {
		const id = page.url.searchParams.get('id');
		if (id) fetchCurrentTask(id);
		else {
			currentTask = null;
			fetchRootTasks();
		}
	});

	async function fetchCurrentTask(task: string | Task) {
		// const api = await api;

		if (typeof task === 'string') {
			// TODO: Fetch currentTask, children, and parents based on id
			(await api.readTask(task)).match(
				(task) => {
					currentTask = task;
				},
				(err) => {
					err.logError();
					goto('/tasks');
				}
			);
		} else {
			currentTask = task;
		}
		(await api.getParentsOf(task)).match(
			(deps) => {
				parents = deps;
			},
			(err) => {
				err.logError();
			}
		);
		(await api.getChildrenOf(task)).match(
			(deps) => {
				children = deps;
			},
			(err) => {
				err.logError();
			}
		);
	}
	async function fetchRootTasks() {
		// const api = await api;

		(await api.getRootTasks()).match(
			(roots) => {
				children = roots;
			},
			(err) => {
				err.logError();
			}
		);
	}

	async function addTask() {
		// const api = await api;
		if (currentTask) {
			(await api.createTask({ title: 'New Subtask', parents: [currentTask.id] })).match(
				(newTask) => {
					fetchCurrentTask(newTask);
				},
				(err) => {
					err.logError();
				}
			);
		} else {
			(await api.createTask({ title: 'New Project' })).match(
				(newTask) => {
					fetchCurrentTask(newTask);
				},
				(err) => {
					err.logError();
				}
			);
		}
	}

	async function onTaskChange(update: Partial<Task>) {
		// api.then((api) => {
		if (currentTask) {
			debouncedUpdate(currentTask.id, update);
		}
		// });
	}

	function onListOrderChanged(items: Task[]) {
		// api.then((api) => {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];

			api.updateTask(item.id, { priority: items.length - index });
		}
		// });
	}

	async function handleTaskDelete(task: Task) {
		// Remove the task from the visual list
		children = children.filter((x) => x.id !== task.id);
		// const api = await api;
		if ((await api.deleteTask(task.id)).isErr()) {
			// Something went wrong, add the item back to the list
		}
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
			<ItemList items={children} accepts={['task']} {onListOrderChanged}>
				{#snippet listItem(task, index)}
					<TaskListItem {task} onDelete={handleTaskDelete} />
				{/snippet}
			</ItemList>
		</TaskEditor>
		<button id="add-task-button" onclick={addTask}>Add Task</button>
	{:else}
		<ItemList items={children} accepts={['task']} {onListOrderChanged}>
			{#snippet listItem(task, index)}
				<TaskListItem {task} onDelete={handleTaskDelete} />
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
