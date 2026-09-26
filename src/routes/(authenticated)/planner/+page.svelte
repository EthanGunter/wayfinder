<script lang="ts">
	import SuggestionListItem from './SuggestionListItem.svelte';
	import TodayListItem from './TodayListItem.svelte';
	import TutorialPlanner from './TutorialPlanner.svelte';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Err, NotFoundError } from '$domain/errors';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { isProjectActive } from '$domain/models/project';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { MediaQuery } from 'svelte/reactivity';
	import Icon from '@iconify/svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { goto } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';

	let projects = tasksAPI.getProjects();
	let todaysList = tasksAPI.getTodaysTasks();

	// Store suggestions for each project
	let projectSuggestions = $state<Map<string, Task[]>>(new Map());
	// Live suggestion subscriptions, one per active project (non-reactive)
	const suggestionSubscriptions = new Map<string, () => void>();
	let expandedProjects = $state<Set<string>>(new Set()); // Track which accordions are open
	// Projects being deleted from this page: hidden right away so their live suggestions query is
	// dropped before the project disappears (otherwise it re-runs and errors with NotFound)
	let deletingProjectIds = $state<Set<string>>(new Set());

	// Mobile responsive state
	const isMobile = new MediaQuery('(max-width: 768px)');
	let suggestionsOpen = $state(false);

	// Filter to active projects only
	let activeProjects = $derived.by(() => {
		if ($projects.status !== 'resolved') return [];
		return $projects.value.filter((p) => isProjectActive(p.data) && !deletingProjectIds.has(p.id));
	});

	// Subscribe to live suggestions for each active project; drop subscriptions for projects that leave the active set
	$effect(() => {
		if ($projects.status !== 'resolved') return;
		const activeIds = new Set(activeProjects.map((p) => p.id));

		untrack(() => {
			let removed = false;
			for (const [projectId, unsubscribe] of suggestionSubscriptions) {
				if (!activeIds.has(projectId)) {
					unsubscribe();
					suggestionSubscriptions.delete(projectId);
					removed = projectSuggestions.delete(projectId) || removed;
				}
			}
			if (removed) projectSuggestions = new Map(projectSuggestions); // Trigger reactivity

			for (const projectId of activeIds) {
				if (suggestionSubscriptions.has(projectId)) continue;
				const unsubscribe = tasksAPI.getPrioritizedTasks(projectId, 15).subscribe((suggestions) => {
					if (suggestions.status === 'resolved') {
						projectSuggestions.set(projectId, suggestions.value);
						projectSuggestions = new Map(projectSuggestions); // Trigger reactivity
					} else if (suggestions.status === 'error') {
						console.error(`Failed to load suggestions for project ${projectId}:`, suggestions.error);
					}
				});
				suggestionSubscriptions.set(projectId, unsubscribe);
			}
		});
	});

	/** Open a project's suggestions (and, on mobile, the Suggestions section). */
	function revealProject(projectId: string) {
		if (isMobile.current) suggestionsOpen = true;
		if (!expandedProjects.has(projectId)) {
			expandedProjects = new Set(expandedProjects).add(projectId);
		}
	}

	/** Delete a project and its subtree without surfacing an error for its suggestions query. */
	async function deleteProject(projectId: string) {
		deletingProjectIds = new Set(deletingProjectIds).add(projectId);
		suggestionSubscriptions.get(projectId)?.();
		suggestionSubscriptions.delete(projectId);
		if (projectSuggestions.delete(projectId)) projectSuggestions = new Map(projectSuggestions);

		const [, error] = await tasksAPI.deleteTask({ id: projectId });
		if (error && !(error instanceof NotFoundError)) {
			// Still there: show it again (the subscription effect resubscribes)
			const next = new Set(deletingProjectIds);
			next.delete(projectId);
			deletingProjectIds = next;
			Err.UNHANDLED(error);
		}
	}

	onDestroy(() => {
		for (const unsubscribe of suggestionSubscriptions.values()) unsubscribe();
		suggestionSubscriptions.clear();
	});

	function isTaskData(data: unknown): data is { type: string; task: Task } {
		return (
			!!data &&
			typeof data === 'object' &&
			'task' in data &&
			'type' in data &&
			(data as any).type === 'task'
		);
	}

	async function onTaskChange(task: Task, changes: Partial<Task['data']>) {
		const [_, error] = await tasksAPI!.updateTask({ id: task.id, ...changes });
		if (error) {
			Err.UNHANDLED(error);
		}
	}

	async function handleAddToToday(task: Task) {
		if ($todaysList.status !== 'resolved') return;
		if (!$todaysList.value.includes(task)) {
			await tasksAPI.updateTask({
				id: task.id,
				todaysTask: new Date()
			});
		}
	}

	async function handleRemoveFromToday(task: Task) {
		// Set to yesterday to remove from today's list while preserving historical data
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const [_, error] = await tasksAPI.updateTask({
			id: task.id,
			todaysTask: yesterday
		});
		if (error) {
			Err.UNHANDLED(error);
		}
	}

	// Get filtered suggestions for a project (excluding completed and today's tasks)
	function getFilteredSuggestions(projectId: string): Task[] {
		const suggestions = projectSuggestions.get(projectId) || [];
		const todaysTasks = $todaysList.status === 'resolved' ? $todaysList.value : [];
		const todaysTaskIds = new Set(todaysTasks.map((t) => t.id));

		return suggestions.filter((task) => !isTaskCompleted(task) && !todaysTaskIds.has(task.id));
	}

	// Derive today's tasks sorted by priority from all suggestions
	let sortedTodaysTasks = $derived.by(() => {
		if ($todaysList.status !== 'resolved') return [];

		// Get all suggestions across all projects
		const allSuggestions = Array.from(projectSuggestions.values()).flat();

		// Filter to only tasks that are in today's list and not completed
		const incompleteTodaysTasks = $todaysList.value.filter((todaysTask) => {
			if (isTaskCompleted(todaysTask)) return false;
			return allSuggestions.some((suggested) => suggested.id === todaysTask.id);
		});

		// Sort by the order they appear in suggestions (already prioritized)
		return incompleteTodaysTasks.sort((a, b) => {
			const aIndex = allSuggestions.findIndex((s) => s.id === a.id);
			const bIndex = allSuggestions.findIndex((s) => s.id === b.id);

			// If both are in suggestions, sort by their priority order
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			// Tasks in suggestions come first
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			// Otherwise maintain original order
			return 0;
		});
	});

	let completedTodaysTasks = $derived.by(() => {
		if ($todaysList.status === 'resolved') {
			return $todaysList.value.filter((t) => isTaskCompleted(t));
		} else return [];
	});

	// Map task IDs to project IDs for navigation
	let taskToProjectMap = $derived.by(() => {
		const map = new Map<string, string>();
		for (const [projectId, tasks] of projectSuggestions.entries()) {
			for (const task of tasks) {
				map.set(task.id, projectId);
			}
		}
		return map;
	});

	// Auto-expand/collapse suggestions on mobile based on today's task count
	$effect(() => {
		if (isMobile.current) {
			if (sortedTodaysTasks.length < 5) {
				suggestionsOpen = true;
				// Expand all project accordions when suggestions auto-open
				expandedProjects = new Set(activeProjects.map((p) => p.id));
			} else if (sortedTodaysTasks.length >= 5) {
				suggestionsOpen = false;
			}
		} else {
			expandedProjects = new Set();
		}
	});
</script>

{#snippet todaysTasks()}
	<h1 class="mb-4 font-semibold text-gray-700">Today's Tasks</h1>
	{#if sortedTodaysTasks.length === 0 && activeProjects.length > 0}
		<h4 class="my-2 text-gray-500 italic">Clean slate! What are you going to do today?</h4>
	{/if}
	<div class="flex flex-col gap-2">
		{#each sortedTodaysTasks as task, index (task.id)}
			<TodayListItem
				bind:task={sortedTodaysTasks[index]}
				projectId={taskToProjectMap.get(task.id) ?? ''}
				{onTaskChange}
				onRemoveFromToday={handleRemoveFromToday}
			/>
		{/each}
		{#if completedTodaysTasks.length > 0}
			<div class="flex w-full items-center gap-3 px-2 text-xs font-medium text-gray-400">
				<div class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"></div>
				<div class="flex items-center gap-1.5">
					<span class="tracking-wider uppercase">Completed</span>
					<span>({completedTodaysTasks.length})</span>
				</div>
				<div class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"></div>
			</div>
			{#each completedTodaysTasks as task, index (task.id)}
				<TodayListItem
					bind:task={completedTodaysTasks[index]}
					projectId={taskToProjectMap.get(task.id) ?? ''}
					{onTaskChange}
					onRemoveFromToday={handleRemoveFromToday}
				/>
			{/each}
		{/if}
	</div>

	{#if sortedTodaysTasks.length > 5}
		<div
			class="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-center text-sm text-orange-700"
		>
			It's not recommended to go over 5 tasks in a day!
		</div>
	{/if}
{/snippet}

{#snippet suggestionsSection()}
	{#if activeProjects.length === 0}
		<div class="flex flex-1 items-center justify-center text-gray-500">
			<p class="italic">No active projects</p>
		</div>
	{:else}
		{#each activeProjects as project (project.id)}
			{@const filteredSuggestions = getFilteredSuggestions(project.id)}
			{@const isExpanded = expandedProjects.has(project.id)}
			<Collapsible.Root
				open={isExpanded}
				onOpenChange={(open) => {
					if (open) {
						expandedProjects.add(project.id);
					} else {
						expandedProjects.delete(project.id);
					}
					expandedProjects = new Set(expandedProjects);
				}}
				class="rounded-md border border-gray-200 bg-gray-50"
			>
				<Collapsible.Trigger
					class="accordion-trigger flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-100"
				>
					<h2 class="font-semibold text-gray-800">{project.data.title}</h2>
					<span class="flex-1"></span>
					<Separator orientation="vertical" class="h-4 w-px bg-gray-200" />
					<button
						class="action-btn mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:cursor-pointer hover:border-1 hover:border-primary hover:bg-blue-50 hover:text-blue-600"
						onclick={() => goto(`/projects/${project.id}`)}
					>
						<Icon icon="majesticons:open" class="size-5" />
					</button>
					<Icon
						icon="lucide:chevron-down"
						class="h-4 w-4 transition-transform {isExpanded ? '-rotate-180' : ''}"
					/>
				</Collapsible.Trigger>
				<Collapsible.Content class="flex flex-col gap-2 px-4 pb-4">
					{#if !projectSuggestions.has(project.id)}
						<p class="text-sm text-gray-400 italic">Loading suggestions...</p>
					{:else if filteredSuggestions.length === 0}
						<p class="text-sm text-gray-400 italic">No suggestions available</p>
					{:else}
						{#each filteredSuggestions as task (task.id)}
							<SuggestionListItem
								{task}
								projectId={project.id}
								{onTaskChange}
								onAddToToday={handleAddToToday}
							/>
						{/each}
					{/if}
				</Collapsible.Content>
			</Collapsible.Root>
		{/each}
	{/if}
{/snippet}

{#if $authState.status === 'signed-in'}
	<AppHeader />
	<TutorialPlanner
		{projects}
		{todaysList}
		isMobile={isMobile.current}
		{revealProject}
		{deleteProject}
	/>

	{#if isMobile.current}
		<!-- Mobile Layout: Today's list on top, suggestions collapsible below -->
		<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
			<div
				id="todays-tasks-panel"
				class="flex flex-col rounded-xl border border-gray-200 bg-gray-50 p-4 transition-all duration-200"
			>
				{@render todaysTasks()}
			</div>
			<div id="suggestions-panel" class="mt-auto rounded-xl border border-gray-200 bg-gray-50">
				<Collapsible.Root bind:open={suggestionsOpen} class="flex flex-col">
					<Collapsible.Trigger
						class="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-100"
					>
						<h2 class="text-lg font-semibold text-gray-800">Suggestions</h2>
						<Icon
							icon="lucide:chevron-down"
							class="h-5 w-5 transition-transform {suggestionsOpen ? '' : '-rotate-180'}"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div class="flex flex-col gap-4 px-4 pb-4 transition-all duration-200">
							{@render suggestionsSection()}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		</div>
	{:else}
		<!-- Desktop Layout: Side-by-side -->
		<div class="mx-auto flex h-full w-full gap-4 overflow-hidden p-4">
			<div
				id="suggestions-panel"
				class="flex w-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 transition-all duration-200"
			>
				<h2 class="text-lg font-semibold text-gray-800">Suggestions</h2>
				{@render suggestionsSection()}
			</div>
			<div class="flex w-1/2 flex-col gap-4">
				<div
					id="todays-tasks-panel"
					class="relative flex flex-1 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 transition-all duration-200"
				>
					{@render todaysTasks()}
				</div>
			</div>
		</div>
	{/if}
{/if}

<style lang="scss">
	:global(.accordion-trigger:has(.action-btn:hover)) {
		background-color: initial;
	}
</style>
