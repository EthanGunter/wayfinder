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
	import Button from '@/components/ui/button/button.svelte';

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

	async function onTaskChange(original: Task, update: Partial<Task>) {
		debouncedUpdate({ taskOrId: original, changes: update });
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
		const deleteResult = await tasks.deleteTask({ taskOrId: task.id });

		if (deleteResult.isOk()) {
			children = children.filter((x) => x.id !== task.id);
		}
	}
</script>

<div class="relative w-full h-full bg-gray-200 grid grid-rows-[auto_1fr_auto] grid-areas-[header_content_footer]">
	<AppHeader user={data.user} authAPI={auth} class="grid-area-header h-16 z-10" />
	<div class="grid-area-content flex flex-col w-full min-w-80 max-w-[35rem] mx-auto p-4 items-center overflow-y-scroll gap-4">
		<!-- TODO: <TasksTutorial /> -->
		{#if currentTask}
			<div class="flex gap-2 items-center mb-4 text-black/50 text-sm">
				<a class="text-gray-600 border border-black/20 rounded px-2 py-1 hover:bg-black/5 no-underline" href="/tasks">
					<!-- Go to root -->
					Projects
				</a>
				{#if parents.length > 0}
					{#each parents as parent, index}
						>
						<a class="text-gray-600 border border-black/20 rounded px-2 py-1 hover:bg-black/5 no-underline" href={`/tasks?id=${parent.id}`}>
							<!-- TODO: Replace with real icon -->
							{parent.title ?? 'Projects'}
						</a>
					{/each}
				{/if}
			</div>
			<TaskEditor bind:task={currentTask} {onTaskChange}>
				<ItemList items={children} accepts={['task']} {onListOrderChanged}>
					{#snippet listItem(task, index)}
						<TaskListItem {task} onDelete={handleTaskDelete} {onTaskChange} />
					{/snippet}
				</ItemList>
			</TaskEditor>
			<Button id="add-task-button" onclick={addTask} class="mt-auto">Add Task</Button>
		{:else}
			<ItemList items={children} accepts={['task']} {onListOrderChanged}>
				{#snippet listItem(task, index)}
					<TaskListItem {task} onDelete={handleTaskDelete} />
				{/snippet}
			</ItemList>
			<Button id="add-task-button" onclick={addTask}>New Project</Button>
		{/if}
	</div>
	<AppFooter class="h-16 grid-area-footer z-10" />
</div>
