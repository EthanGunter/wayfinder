<script lang="ts">
	import { type Task } from '$lib/API/Tasks/Task';
	import { page } from '$app/state';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskListItem from '$lib/components/TaskListItem.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { goto } from '$app/navigation';
	import debounce from '$lib/debounce';
	import { ErrorType } from '$lib/Errors.js';

	const { data } = $props();
	const auth = data.auth;
	const tasks = data.tasks;
	const user = data.user;

	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

	const debouncedUpdate = debounce(tasks.updateTask, 500);

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
		if (typeof task === 'string') {
			// TODO: Fetch currentTask, children, and parents based on id
			const result = await tasks.getTask({ id: task });
			if (result.isErr()) {
				switch (result.error.type) {
					case ErrorType.NotFoundError:
						goto('/tasks');
						break;
					default:
						result.error.logError();
				}
				return;
			}
			currentTask = result.value;
		} else {
			currentTask = task;
		}

		// Now currentTask is guaranteed to be a Task object, not a string
		if (!currentTask) return;
		(await tasks.getParentsOf({ taskOrId: currentTask })).match(
			(deps) => {
				parents = deps;
			},
			(err) => {
				err.logError();
			}
		);
		(await tasks.getChildrenOf({ taskOrId: currentTask })).match(
			(deps) => {
				children = deps;
			},
			(err) => {
				err.logError();
			}
		);
		// TODO change id url param
	}

	async function fetchRootTasks() {
		// const api = await api;

		(await tasks.getRootTasks()).match(
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
			(
				await tasks.createTask({
					createDetail: {
						user_id: user.id,
						title: 'New Subtask',
						parents: [currentTask.id]
					}
				})
			).match(
				(newTask) => {
					fetchCurrentTask(newTask);
				},
				(err) => {
					err.logError();
				}
			);
		} else {
			(await tasks.createTask({ createDetail: { user_id: user.id, title: 'New Project' } })).match(
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
			debouncedUpdate({ taskOrId: currentTask, changes: update });
		}
		// });
	}

	function onListOrderChanged(items: Task[]) {
		// api.then((api) => {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];

			tasks.updateTask({ taskOrId: item, changes: { priority: items.length - index } });
		}
		// });
	}

	async function handleTaskDelete(task: Task) {
		// Remove the task from the visual list
		children = children.filter((x) => x.id !== task.id);
		// const api = await api;
		if ((await tasks.deleteTask({ taskOrId: task.id })).isErr()) {
			// Something went wrong, add the item back to the list
		}
	}
</script>

<div class="task-browser page">
	<AppHeader user={data.user} authAPI={auth} />
	<div class="content">
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
	</div>
	<AppFooter />
</div>

<style>
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
