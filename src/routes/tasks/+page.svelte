<script lang="ts">
	import { type Task } from '$lib/API/Tasks/Task';
	import type { TaskDelta } from '$lib/API/Tasks/types';
	import { page } from '$app/state';
	import ItemList from '$lib/components/ItemList.svelte';
	import TaskEditor from './TaskEditor.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { goto } from '$app/navigation';
	import debounce from '$lib/debounce';
	import Button from '@/components/ui/button/button.svelte';
	import { authState } from '@/API/Auth';
	import { tasksAPI } from '@/API/Tasks';
	import { onMount } from 'svelte';
	import { type ILocalTasks } from '@/API/Tasks';
	import type { User } from '@/API/Auth/User';
	import TaskListItem from './TaskListItem.svelte';
	import Icon from '@iconify/svelte';
	import TaskCreationDrawer from './TaskCreationDrawer.svelte';
	import TutorialExampleProject from './TutorialExampleProject.svelte';

	let currentTask = $state<Task | null>(null);
	let children = $state<Task[]>([]);
	let parents = $state<Task[]>([]);

	// Task creation drawer state
	let showTaskCreationDrawer = $state(false);

	let debouncedUpdate = $derived(debounce(tasksAPI.updateTask, 500));

	// Sort tasks by priority (higher priority first)
	function sortTasksByPriority(a: Task, b: Task): number {
		return (b.priority ?? 0) - (a.priority ?? 0);
	}

	// TODO:remove I think this is handled by src/routes/+layout.ts
	/* onMount(() => {
		// Subscribe to auth state
		const unsubscribeAuth = authState.subscribe((state) => {
			if (state.status === 'signed-out') {
				goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			}
		});

		return () => {
			unsubscribeAuth();
		};
	}); */

	let unsubscribe: (() => void) | null = null;
	let taskIndex = new Map<string, Task>();

	function recomputeFromIndex() {
		const id = page.url.searchParams.get('id');
		if (id) {
			const t = taskIndex.get(id) ?? null;
			currentTask = t;
			if (!t) {
				goto('/tasks');
				parents = [];
				children = [];
				return;
			}
			parents = (t.parents ?? []).map((pid) => taskIndex.get(pid)).filter(Boolean) as Task[];
			children = (t.children ?? []).map((cid) => taskIndex.get(cid)).filter(Boolean) as Task[];
		} else {
			currentTask = null;
			parents = [];
			children = Array.from(taskIndex.values()).filter((t) => (t.parents?.length ?? 0) === 0);
		}
	}

	function handleInit(initialTasks: Task[]) {
		taskIndex = new Map(initialTasks.map((t) => [t.id, t]));
		recomputeFromIndex();
	}

	function handleChanges(changes: TaskDelta[]) {
		for (const change of changes) {
			if (change.newTask && change.oldTask) {
				taskIndex.set(change.newTask.id, change.newTask);
			} else if (change.newTask && !change.oldTask) {
				taskIndex.set(change.newTask.id, change.newTask);
			} else if (!change.newTask && change.oldTask) {
				taskIndex.delete(change.oldTask.id);
			}
		}
		recomputeFromIndex();
	}

	$effect(() => {
		if ($authState.status !== 'signed-in') return;
		unsubscribe?.();
		const id = page.url.searchParams.get('id');
		if (id) {
			unsubscribe = tasksAPI.subscribeTasks({
				ids: [id],
				ancestorDepth: 1,
				descendantDepth: 1,
				onInitialize: handleInit,
				onChange: handleChanges
			});
		} else {
			// TODO:optimization only subscribe to the root tasks
			unsubscribe = tasksAPI.subscribeTasks({
				userId: $authState.user.id,
				onInitialize: handleInit,
				onChange: handleChanges
			});
		}
		return () => {
			unsubscribe?.();
			unsubscribe = null;
		};
	});

	function addTask() {
		showTaskCreationDrawer = true;
	}

	function handleTaskCreated(newTask: Task) {
		// Subscription will deliver the new task; no manual fetch needed
		showTaskCreationDrawer = false;
	}

	function handleDrawerOpenChange(open: boolean) {
		showTaskCreationDrawer = open;
	}

	async function onTaskChange(original: Task, update: Partial<Task>) {
		const res = await tasksAPI!.updateTask({ id: original.id, data: update });
		res.match(
			() => {},
			(err) => {
				err.logError();
			}
		);
	}

	async function onListOrderChanged(items: Task[]) {
		await Promise.all(
			items.map((item, idx, arr) => {
				const newPriority = arr.length - idx;
				return tasksAPI!.updateTask({ id: item.id, data: { priority: newPriority } });
			})
		);
	}

	async function onDelete(task: Task, recursive: boolean) {
		await tasksAPI!.deleteTask({ id: task.id, recursive });
	}

	async function onDeleteCurrentTask(task: Task, recursive: boolean) {
		// Always delete recursively to maintain graph integrity
		const deleteResult = await tasksAPI!.deleteTask({ id: task.id, recursive: true });

		if (deleteResult.isOk()) {
			// Navigate back to parent or root after deleting current task
			if (parents.length > 0) {
				const parentTask = parents[parents.length - 1];
				goto(`/tasks?id=${parentTask.id}`);
			} else {
				goto('/tasks');
			}
		}
	}
</script>

{#if $authState.status === 'signed-in'}
	<TutorialExampleProject />
	<div class="page page-root">
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
					<TaskEditor bind:task={currentTask} {onTaskChange} onDelete={onDeleteCurrentTask}>
						<!-- Child Tasks Section -->
						<section id="sec-task-list" class="mt-6">
							<h3 class="mb-4 text-lg font-medium text-gray-900">Subtasks</h3>
							{#if children.length > 0}
								<ItemList
									items={children}
									accepts={['task']}
									{onListOrderChanged}
									sortFunction={sortTasksByPriority}
								>
									{#snippet listItem(task, index)}
										<TaskListItem {task} {onTaskChange} {onDelete} />
									{/snippet}
								</ItemList>
							{/if}
							<!-- Add task button at bottom -->
							<div class="mt-3 border-t border-gray-100 pt-3">
								<button
									id="btn-add-task"
									onclick={addTask}
									class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-500 hover:bg-gray-50 hover:text-gray-700"
								>
									<Icon icon="lucide:plus" class="size-4" />
									<span>New subtask</span>
								</button>
							</div>
						</section>
					</TaskEditor>
				</div>
			{:else}
				<!-- Root Projects View -->
				<div class="mb-6">
					<h1 class="mb-6 text-2xl font-semibold text-gray-900">Projects</h1>
					<div class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
						<ItemList
							items={children}
							accepts={['task']}
							{onListOrderChanged}
							sortFunction={sortTasksByPriority}
						>
							{#snippet listItem(task, index)}
								<TaskListItem {task} {onTaskChange} {onDelete} />
							{/snippet}
						</ItemList>
						{#if children.length === 0}
							<div class="py-12 text-center text-gray-500">
								<p class="mb-4 text-lg">No projects yet</p>
								<Button
									onclick={addTask}
									class="mx-auto flex items-center gap-2 rounded-lg px-3 py-2 text-left"
								>
									<p class="text-sm">Create your first project to get started</p>
								</Button>
							</div>
						{:else}
							<!-- Add project button at bottom -->
							<div class="mt-3 border-t border-gray-100 pt-3">
								<button
									id="btn-add-task"
									onclick={addTask}
									class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-500 hover:bg-gray-50 hover:text-gray-700"
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
		<AppFooter className="z-10" />
	</div>

	<!-- Task Creation Drawer -->
	{#if $authState.user}
		<TaskCreationDrawer
			bind:open={showTaskCreationDrawer}
			onOpenChange={handleDrawerOpenChange}
			onTaskCreated={handleTaskCreated}
			tasks={tasksAPI}
			user={$authState.user}
			relation={currentTask ? { task: currentTask, mode: 'parent' } : null}
		/>
	{/if}
{/if}
