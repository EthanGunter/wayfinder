<script lang="ts">
	import { type Task } from '$lib/API/Tasks/Task';
	import { page } from '$app/state';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskEditor from '$lib/components/TaskEditor.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { goto, invalidate } from '$app/navigation';
	import debounce from '$lib/debounce';
	import { ErrorType } from '$lib/Errors.js';
	import Button from '@/components/ui/button/button.svelte';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import { type ILocalTasks } from '@/API/Tasks';
	import type { User } from '@/API/Auth/User';
	import { redirect } from '@sveltejs/kit';
	import TaskListItem from './TaskListItem.svelte';
	import Icon from '@iconify/svelte';

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
		await fetchAncestorsOf(currentTask);
		await fetchChildrenOf(currentTask);
		// TODO change id url param
	}

	async function fetchAncestorsOf(task: Task) {
		if (!tasks) return;
		(await tasks.getParentsOf({ taskOrId: task })).match(
			(deps) => {
				parents = deps;
			},
			(err) => {
				err.logError();
			}
		);
	}

	async function fetchChildrenOf(task: Task) {
		if (!tasks) return;
		(await tasks.getChildrenOf({ taskOrId: task.id })).match(
			(deps) => {
				children = deps;
			},
			(err) => {
				err.logError();
			}
		);
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
					// fetchCurrentTask(newTask);
					fetchChildrenOf(currentTask!);
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
					// fetchCurrentTask(newTask);
					fetchRootTasks();
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
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			tasks!.updateTask({ taskOrId: item, changes: { priority: items.length - index } });
		}
	}

	async function onDelete(task: Task) {
		// Remove the task from the visual list
		const deleteResult = await tasks!.deleteTask({ taskOrId: task.id });

		if (deleteResult.isOk()) {
			children = children.filter((x) => x.id !== task.id);
		}
	}
</script>

{#if user && tasks}
	<div class="page page-root bg-gray-50">
		<AppHeader class="z-10 h-16" />
		<div
			class="grid-area-content mx-auto flex w-full max-w-4xl flex-col overflow-y-scroll px-4 py-4 sm:px-6 lg:px-8"
		>
			<!-- TODO: <TasksTutorial /> -->
			<!-- TODO:BUG get full ancestry for breadcrumbs -->
			{#if currentTask}
				<!-- Breadcrumb Navigation -->
				<nav class="mb-4 flex items-center gap-2 text-sm text-gray-500" aria-label="Breadcrumb">
					<a
						class="rounded-lg px-3 py-1.5 text-gray-600 no-underline transition-colors hover:bg-gray-100 hover:text-gray-900"
						href="/tasks"
					>
						Projects
					</a>
					{#if parents.length > 0}
						{#each parents as parent, index}
							<span class="text-gray-400">›</span>
							<a
								class="rounded-lg px-3 py-1.5 text-gray-600 no-underline transition-colors hover:bg-gray-100 hover:text-gray-900"
								href={`/tasks?id=${parent.id}`}
							>
								{parent.title ?? 'Untitled'}
							</a>
						{/each}
					{/if}
				</nav>
				<!-- Current Task Editor -->
				<div class="mb-8 rounded-xl bg-white shadow-sm ring-1 ring-gray-200/50">
					<TaskEditor bind:task={currentTask} {onTaskChange}>
						<!-- Child Tasks Section -->
						<div class="mt-6">
							<div class="mb-4 flex items-center gap-2 px-10">
								<h3 class="text-lg font-medium text-gray-900">Subtasks</h3>
							</div>
							{#if children.length > 0}
								<ItemList items={children} accepts={['task']} {onListOrderChanged}>
									{#snippet listItem(task, index)}
										<TaskListItem {task} {onTaskChange} {onDelete} />
									{/snippet}
								</ItemList>
							{/if}
							<!-- Add task button at bottom -->
							<div class="mt-2 px-10">
								<button
									onclick={addTask}
									class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-500 hover:bg-gray-50 hover:text-gray-700"
								>
									<Icon icon="lucide:plus" class="size-4" />
									<span>Add subtask</span>
								</button>
							</div>
						</div>
					</TaskEditor>
				</div>
			{:else}
				<!-- Root Projects View -->
				<div class="mb-6">
					<div class="mb-6 flex items-center gap-2">
						<h1 class="text-2xl font-semibold text-gray-900">Projects</h1>
						<button
							onclick={addTask}
							class="ml-2 flex size-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
							title="New project"
						>
							<Icon icon="lucide:plus" class="size-5" />
						</button>
					</div>
					<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
						<ItemList items={children} accepts={['task']} {onListOrderChanged}>
							{#snippet listItem(task, index)}
								<TaskListItem {task} {onTaskChange} {onDelete} />
							{/snippet}
						</ItemList>
						{#if children.length === 0}
							<div class="py-12 text-center text-gray-500">
								<p class="text-lg">No projects yet</p>
								<p class="text-sm">Create your first project to get started</p>
							</div>
						{:else}
							<!-- Add project button at bottom -->
							<div class="mt-3 border-t border-gray-100 pt-3">
								<button
									onclick={addTask}
									class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-500 hover:bg-gray-50 hover:text-gray-700"
								>
									<Icon icon="lucide:plus" class="size-4" />
									<span>New project</span>
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		<AppFooter className="z-10 h-16" />
	</div>
{/if}
