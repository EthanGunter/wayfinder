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
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import { type ILocalTasks } from '@/API/Tasks';
	import type { User } from '@/API/Auth/User';
	import { redirect } from '@sveltejs/kit';

	let auth = $state<ILocalAuth>();
	let tasks = $state<ILocalTasks>();
	let user = $state<User>();

	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

	let debouncedUpdate = $derived(tasks ? debounce(tasks?.updateTask, 500) : undefined);

	onMount(async () => {
		tasks = await taskAPIPromise;

		auth = await authAPIPromise;
		const active = await auth.getActiveUser();
		if (!active) {
			goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			return;
		}
		user = active;
	});

	$effect(() => {
		const id = page.url.searchParams.get('id');
		if (id) fetchCurrentTask(id);
		else {
			currentTask = null;
			fetchRootTasks();
		}
	});

	async function fetchCurrentTask(task: string | Task) {
		if (!tasks) return;

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
		if (!tasks) return;

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
		if (currentTask) {
			(
				await tasks!.createTask({
					createDetail: {
						user_id: user!.id,
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
			(
				await tasks!.createTask({ createDetail: { user_id: user!.id, title: 'New Project' } })
			).match(
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
		debouncedUpdate!({ taskOrId: original, changes: update });
	}

	function onListOrderChanged(items: Task[]) {
		// api.then((api) => {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];

			tasks!.updateTask({ taskOrId: item, changes: { priority: items.length - index } });
		}
		// });
	}

	async function handleTaskDelete(task: Task) {
		// Remove the task from the visual list
		const deleteResult = await tasks!.deleteTask({ taskOrId: task.id });

		if (deleteResult.isOk()) {
			children = children.filter((x) => x.id !== task.id);
		}
	}
</script>

{#if user && tasks}
	<div class="page page-root">
		<AppHeader class="z-10 h-16" />
		<div
			class="grid-area-content mx-auto flex w-full max-w-[35rem] min-w-80 flex-col items-center gap-4 overflow-y-scroll p-4"
		>
			<!-- TODO: <TasksTutorial /> -->
			{#if currentTask}
				<div class="mb-4 flex items-center gap-2 text-sm text-black/50">
					<a
						class="rounded border border-black/20 px-2 py-1 text-gray-600 no-underline hover:bg-black/5"
						href="/tasks"
					>
						<!-- Go to root -->
						Projects
					</a>
					{#if parents.length > 0}
						{#each parents as parent, index}
							>
							<a
								class="rounded border border-black/20 px-2 py-1 text-gray-600 no-underline hover:bg-black/5"
								href={`/tasks?id=${parent.id}`}
							>
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
		<AppFooter className="z-10 h-16" />
	</div>
{/if}
