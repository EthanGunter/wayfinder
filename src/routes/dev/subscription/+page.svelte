<script lang="ts">
	import { type Task } from '$domain/models/task';
	import tasksAPI from '$lib/API/Tasks';
	import TaskEditor from '../../graph/TaskEditor.svelte';
	import { authState } from '$lib/API/Auth';
	import type { QueryableStore } from '$lib/API/fetchableStore';
	import { onMount } from 'svelte';
	import type { Readable } from 'svelte/store';

	let selectedTaskId = $state('');
	let availableTasks = $state<Task[]>([]);
	let selectedTask = $state<Task | null>(null);

	// Store of all user tasks (subscription)
	let allUserTasksStore = $derived.by(() => {
		const auth = $authState;
		if (auth.status !== 'signed-in') return null;
		return tasksAPI.getAllUserTasks({ userId: auth.user.id });
	});

	// Keep selection options in sync with store
	$effect(() => {
		if (allUserTasksStore) {
			const v = $allUserTasksStore!;
			if (v.status === 'resolved') {
				availableTasks = v.data;
				if (!selectedTaskId && v.data.length > 0) selectedTaskId = v.data[0].id;
			}
		}
	});

	// Reactive subscriptions based on selected task
	let taskStore = $derived.by(() => {
		if (!selectedTaskId) return null;
		return tasksAPI.getTask({ id: selectedTaskId });
	});

	let childrenStore = $derived.by(() => {
		if (!selectedTaskId) return null;
		return tasksAPI.getChildrenOf({ id: selectedTaskId });
	});

	// Update selectedTask when store updates
	let taskStoreValue = $derived(taskStore ? $state.snapshot($taskStore) : null);
	$effect(() => {
		if (taskStoreValue && taskStoreValue.status === 'resolved') {
			selectedTask = taskStoreValue.data;
		}
	});

	// Other query subscriptions
	let parentsStore = $derived.by(() => {
		if (!selectedTaskId) return null;
		return tasksAPI.getParentsOf({ id: selectedTaskId });
	});
	let rootStore = $derived(tasksAPI.getRootTasks());
	let todaysStore = $derived(tasksAPI.getTodaysTasks());
	let prioritizedStore = $derived(tasksAPI.getPrioritizedTasks(5));

	function handleTaskChange(original: Task, update: Partial<Task>) {
		console.log('[Test Page] Task changed:', original.id, update);
		void tasksAPI.updateTask({ id: original.id, data: update });
	}

	async function handleTaskDelete(task: Task) {
		console.log('[Test Page] Deleting task:', task.id);
		await tasksAPI.deleteTask({ id: task.id });
		selectedTaskId = availableTasks[0]?.id || '';
	}

	async function createTestTask() {
		const auth = $authState;
		if (auth.status !== 'signed-in') return;
		
		const [newId, error] = await tasksAPI.createTask({
			createDetail: {
				id: crypto.randomUUID(),
				userAuthId: auth.user.id,
				title: `Test Task ${Date.now()}`,
				content: 'Created from subscription test page'
			}
		});
		
		if (!error && newId) {
			console.log('[Test Page] Created task:', newId);
			selectedTaskId = newId;
		}
	}
</script>

<div class="subscription-test-page p-6 max-w-7xl mx-auto">
	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Subscription API Test Page</h1>
		<p class="text-gray-600">Test real-time subscription behavior for all ITasksLocal functions</p>
	</div>

	<!-- Task Selection -->
	<div class="mb-6 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
		<h2 class="text-lg font-semibold mb-3">Task Selection</h2>
		<div class="flex gap-3 items-center">
			<select 
				bind:value={selectedTaskId}
				class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				<option value="">-- Select a task --</option>
				{#each availableTasks as task}
					<option value={task.id}>{task.title}</option>
				{/each}
			</select>
			<button 
				onclick={createTestTask}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
			>
				Create Test Task
			</button>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Left Column: Selected Task Editor -->
		<div class="space-y-6">
			<!-- getTask (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getTask() - FetchableReadable&lt;Task&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to selected task</p>
				
				{#if taskStore}
					{@const taskValue = $taskStore!}
					{#if taskValue.status === 'loading'}
						<div class="text-gray-500 italic">Loading task...</div>
					{:else if taskValue.status === 'error'}
						<div class="text-red-600">Error: {taskValue.error.message}</div>
					{:else if taskValue.status === 'resolved' && selectedTask}
						<div class="border border-gray-300 rounded-lg overflow-hidden">
							<TaskEditor 
								bind:task={selectedTask}
								onTaskChange={handleTaskChange}
								onDelete={handleTaskDelete}
							/>
						</div>
					{/if}
				{:else}
					<div class="text-gray-400 italic">No task selected</div>
				{/if}
			</div>

			<!-- getChildrenOf (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getChildrenOf() - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to children (updates when children change or reorder)</p>
				
				{#if childrenStore}
					{@const childrenValue = $childrenStore!}
					{#if childrenValue.status === 'loading'}
						<div class="text-gray-500 italic">Loading children...</div>
					{:else if childrenValue.status === 'error'}
						<div class="text-red-600">Error: {childrenValue.error.message}</div>
					{:else if childrenValue.status === 'resolved'}
						{#if childrenValue.data.length === 0}
							<div class="text-gray-400 italic">No children</div>
						{:else}
							<ul class="space-y-1">
								{#each childrenValue.data as child, idx}
									<li class="flex items-center gap-2 p-2 border border-gray-200 rounded">
										<span class="text-xs text-gray-500 font-mono">{idx}</span>
										<span class="flex-1">{child.title}</span>
										<span class="text-xs text-gray-400">{child.id.slice(0, 8)}</span>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				{:else}
					<div class="text-gray-400 italic">No task selected</div>
				{/if}
			</div>

			<!-- getParentsOf (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getParentsOf() - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to parents of selected task</p>
				{#if !selectedTaskId}
					<div class="text-gray-400 italic">No task selected</div>
				{:else if parentsStore}
					{@const parentsVal = $parentsStore!}
					{#if parentsVal.status === 'loading'}
						<div class="text-gray-500 italic">Loading parents...</div>
					{:else if parentsVal.status === 'error'}
						<div class="text-red-600">Error: {parentsVal.error.message}</div>
					{:else if parentsVal.status === 'resolved'}
						{#if parentsVal.data.length === 0}
							<div class="text-gray-400 italic">No parents</div>
						{:else}
							<ul class="space-y-1">
								{#each parentsVal.data as parent}
									<li class="p-2 border border-gray-200 rounded">
										<div>{parent.title}</div>
										<div class="text-xs text-gray-400">{parent.id.slice(0, 8)}</div>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				{/if}
			</div>
		</div>

		<!-- Right Column: Global Queries -->
		<div class="space-y-6">
			<!-- getAllUserTasks (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getAllUserTasks(userId) - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to ALL user tasks</p>
				{#if allUserTasksStore}
					{@const allTasksVal = $allUserTasksStore!}
					{#if allTasksVal.status === 'loading'}
						<div class="text-gray-500 italic">Loading tasks...</div>
					{:else if allTasksVal.status === 'error'}
						<div class="text-red-600">Error: {allTasksVal.error.message}</div>
					{:else if allTasksVal.status === 'resolved'}
						<div class="mb-2 text-sm font-medium">
							Total: {allTasksVal.data.length} tasks
						</div>
						<div class="max-h-60 overflow-y-auto border border-gray-200 rounded">
							<ul class="divide-y divide-gray-200">
								{#each allTasksVal.data.slice(0, 10) as task}
									<li class="p-2 hover:bg-gray-50">
										<div class="flex justify-between items-center">
											<span class="flex-1 truncate">{task.title}</span>
											<button onclick={() => selectedTaskId = task.id} class="text-xs text-blue-600 hover:underline">Select</button>
										</div>
									</li>
								{/each}
								{#if allTasksVal.data.length > 10}
									<li class="p-2 text-center text-sm text-gray-500">... and {allTasksVal.data.length - 10} more</li>
								{/if}
							</ul>
						</div>
					{/if}
				{:else}
					<div class="text-gray-400 italic">Not authenticated</div>
				{/if}
			</div>

			<!-- getRootTasks (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getRootTasks() - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to root tasks</p>
				{#if $rootStore.status === 'loading'}
					<div class="text-gray-500 italic">Loading root tasks...</div>
				{:else if $rootStore.status === 'error'}
					<div class="text-red-600">Error: {$rootStore.error.message}</div>
				{:else if $rootStore.status === 'resolved'}
					<div class="mb-2 text-sm font-medium">Count: {$rootStore.data.length}</div>
					{#if $rootStore.data.length === 0}
						<div class="text-gray-400 italic">No root tasks</div>
					{:else}
						<ul class="space-y-1">
							{#each $rootStore.data.slice(0, 5) as task}
								<li class="p-2 border border-gray-200 rounded hover:bg-gray-50">
									<button onclick={() => selectedTaskId = task.id} class="text-left w-full">{task.title}</button>
								</li>
							{/each}
							{#if $rootStore.data.length > 5}
								<li class="text-xs text-gray-500 text-center">... and {$rootStore.data.length - 5} more</li>
							{/if}
						</ul>
					{/if}
				{/if}
			</div>

			<!-- getTodaysTasks (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getTodaysTasks() - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to Today's tasks</p>
				{#if $todaysStore.status === 'loading'}
					<div class="text-gray-500 italic">Loading today's tasks...</div>
				{:else if $todaysStore.status === 'error'}
					<div class="text-red-600">Error: {$todaysStore.error.message}</div>
				{:else if $todaysStore.status === 'resolved'}
					<div class="mb-2 text-sm font-medium">Count: {$todaysStore.data.length}</div>
					{#if $todaysStore.data.length === 0}
						<div class="text-gray-400 italic">No tasks scheduled for today</div>
					{:else}
						<ul class="space-y-1">
							{#each $todaysStore.data as task}
								<li class="p-2 border border-gray-200 rounded hover:bg-gray-50">
									<button onclick={() => selectedTaskId = task.id} class="text-left w-full">{task.title}</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>

			<!-- getPrioritizedTasks (subscription) -->
			<div class="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
				<h3 class="text-lg font-semibold mb-2 text-blue-700">
					getPrioritizedTasks(5) - FetchableReadable&lt;Task[]&gt;
				</h3>
				<p class="text-sm text-gray-600 mb-3">Real-time subscription to prioritized tasks</p>
				{#if $prioritizedStore.status === 'loading'}
					<div class="text-gray-500 italic">Loading prioritized tasks...</div>
				{:else if $prioritizedStore.status === 'error'}
					<div class="text-red-600">Error: {$prioritizedStore.error.message}</div>
				{:else if $prioritizedStore.status === 'resolved'}
					<div class="mb-2 text-sm font-medium">Top {$prioritizedStore.data.length} tasks</div>
					{#if $prioritizedStore.data.length === 0}
						<div class="text-gray-400 italic">No prioritized tasks</div>
					{:else}
						<ul class="space-y-1">
							{#each $prioritizedStore.data as task, idx}
								<li class="p-2 border border-gray-200 rounded hover:bg-gray-50">
									<button onclick={() => selectedTaskId = task.id} class="text-left w-full flex items-center gap-2">
										<span class="text-xs text-gray-500 font-mono">#{idx + 1}</span>
										<span class="flex-1">{task.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<!-- Legend -->
	<div class="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
		<h3 class="font-semibold mb-2">Legend:</h3>
		<ul class="text-sm space-y-1">
			<li class="flex items-center gap-2">
				<span class="w-3 h-3 bg-blue-700 rounded"></span>
				<span><strong>Blue:</strong> FetchableReadable - Real-time subscription (updates automatically)</span>
			</li>
		</ul>
		<p class="text-sm text-gray-600 mt-3">
			Try: Edit the selected task, reorder children, or create/delete tasks. Watch how the subscriptions update in real-time!
		</p>
	</div>
</div>

<style>
	.subscription-test-page {
		min-height: 100vh;
		background: #f9fafb;
	}
</style>

