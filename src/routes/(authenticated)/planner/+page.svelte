<script lang="ts">
	import {
		dropTargetForElements,
		monitorForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import SuggestionListItem from './SuggestionListItem.svelte';
	import TodayListItem from './TodayListItem.svelte';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { isProjectActive, type ProjectData } from '$domain/models/project';
	import type { IAppNode } from '$domain/models/node';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { MediaQuery } from 'svelte/reactivity';
	import Icon from '@iconify/svelte';

	let projects = tasksAPI.getProjects();
	let todaysList = tasksAPI.getTodaysTasks();

	// Store suggestions for each project
	let projectSuggestions = $state<Map<string, Task[]>>(new Map());
	let loadedProjectIds = new Set<string>(); // Track which projects we've loaded (non-reactive)
	let expandedProjects = $state<Set<string>>(new Set()); // Track which accordions are open

	// Mobile responsive state
	const isMobile = new MediaQuery('(max-width: 768px)');
	let suggestionsOpen = $state(false);

	// Filter to active projects only
	let activeProjects = $derived.by(() => {
		if ($projects.status !== 'resolved') return [];
		return $projects.value.filter((p) => isProjectActive(p.data));
	});

	// Load suggestions for active projects
	$effect(() => {
		if ($projects.status === 'resolved') {
			const active = activeProjects;

			// Load suggestions for each active project
			active.forEach((project) => {
				if (!loadedProjectIds.has(project.id)) {
					loadedProjectIds.add(project.id);

					tasksAPI
						.getPrioritizedTasks(project.id, 15)
						.then((suggestions) => {
							projectSuggestions.set(project.id, suggestions);
							projectSuggestions = new Map(projectSuggestions); // Trigger reactivity
						})
						.catch((error) => {
							console.error(`Failed to load suggestions for project ${project.id}:`, error);
							loadedProjectIds.delete(project.id); // Allow retry on error
						});
				}
			});
		}
	});

	let todaysDropZoneEl: HTMLElement | undefined = $state();
	let projectsPaneEl: HTMLElement | undefined = $state();
	let isDraggingOverTodays = $state(false);
	let isDraggingOverProjects = $state(false);
	let isValidDrop = $state(false);

	function isTaskData(data: unknown): data is { type: string; task: Task } {
		return (
			!!data &&
			typeof data === 'object' &&
			'task' in data &&
			'type' in data &&
			(data as any).type === 'task'
		);
	}

	// Set up drop targets
	$effect(() => {
		const cleanups: (() => void)[] = [];

		if (todaysDropZoneEl) {
			cleanups.push(
				dropTargetForElements({
					element: todaysDropZoneEl,
					canDrop: ({ source }) => isTaskData(source.data),
					onDragEnter: () => {
						isDraggingOverTodays = true;
						isValidDrop = true;
					},
					onDragLeave: () => {
						isDraggingOverTodays = false;
						isValidDrop = false;
					},
					onDrop: () => {
						isDraggingOverTodays = false;
						isValidDrop = false;
					}
				})
			);
		}

		if (projectsPaneEl) {
			cleanups.push(
				dropTargetForElements({
					element: projectsPaneEl,
					canDrop: ({ source }) => isTaskData(source.data),
					onDragEnter: () => {
						isDraggingOverProjects = true;
						isValidDrop = true;
					},
					onDragLeave: () => {
						isDraggingOverProjects = false;
						isValidDrop = false;
					},
					onDrop: () => {
						isDraggingOverProjects = false;
						isValidDrop = false;
					}
				})
			);
		}

		return () => cleanups.forEach((fn) => fn());
	});

	// Monitor for drops
	$effect(() => {
		const cleanup = monitorForElements({
			onDrop: async ({ location, source }) => {
				if (!isTaskData(source.data)) return;

				const target = location.current.dropTargets[0];
				if (!target) return;

				const task = source.data.task;

				// Determine which drop zone received the drop
				if (target.element === todaysDropZoneEl) {
					if ($todaysList.status !== 'resolved') return;
					if (!$todaysList.value.includes(task)) {
						await tasksAPI.updateTask({
							id: task.id,
							todaysTask: new Date()
						});
					}
				} else if (target.element === projectsPaneEl) {
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
			}
		});

		return cleanup;
	});

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
		}
	});
</script>

{#if $authState.status === 'signed-in'}
	<AppHeader />

	{#if isMobile.current}
		<!-- Mobile Layout: Today's list on top, suggestions collapsible below -->
		<div class="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
			<!-- Today's Tasks -->
			<div
				bind:this={todaysDropZoneEl}
				class="flex flex-col rounded-xl border-2 p-4 transition-all duration-200 {isDraggingOverTodays &&
				isValidDrop
					? 'border-solid border-green-500 bg-gradient-to-br from-green-50/15 to-green-50/10 shadow-lg'
					: 'border-dashed border-blue-200 bg-gradient-to-br from-blue-100 to-blue-200'}"
			>
				<h1
					class="mb-4 font-semibold text-gray-700 {isDraggingOverTodays && isValidDrop
						? 'text-green-700'
						: ''}"
				>
					Today's Tasks
				</h1>
				{#if sortedTodaysTasks.length === 0 && activeProjects.length > 0}
					<h4 class="my-2 text-gray-500 italic">Nothing here. Tap suggestions below!</h4>
				{/if}
				<div class="flex flex-col gap-2">
					{#each sortedTodaysTasks as task, index (task.id)}
						<TodayListItem
							bind:task={sortedTodaysTasks[index]}
							{onTaskChange}
							onRemoveFromToday={handleRemoveFromToday}
						/>
					{/each}
					{#if completedTodaysTasks.length > 0}
						<div class="flex w-full items-center gap-3 px-2 text-xs font-medium text-gray-400">
							<div
								class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"
							></div>
							<div class="flex items-center gap-1.5">
								<span class="tracking-wider uppercase">Completed</span>
								<span>({completedTodaysTasks.length})</span>
							</div>
							<div
								class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"
							></div>
						</div>
						{#each completedTodaysTasks as task, index (task.id)}
							<TodayListItem
								bind:task={completedTodaysTasks[index]}
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
			</div>

			<!-- Suggestions Collapsible -->
			<div class="rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100">
				<Collapsible.Root
					bind:open={suggestionsOpen}
					class="flex flex-col"
				>
					<Collapsible.Trigger
						class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50/50"
					>
						<h2 class="text-lg font-semibold text-gray-800">Suggestions</h2>
						<Icon
							icon="lucide:chevron-down"
							class="h-5 w-5 transition-transform {suggestionsOpen ? '' : '-rotate-180'}"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content>
						<div
							bind:this={projectsPaneEl}
							class="flex flex-col gap-4 px-4 pb-4 transition-all duration-200 {isDraggingOverProjects &&
							isValidDrop
								? 'bg-gradient-to-br from-green-50/15 to-green-50/10'
								: ''}"
						>
							{#if activeProjects.length === 0}
								<div class="flex items-center justify-center py-8 text-gray-500">
									<p class="italic">No active projects</p>
								</div>
							{:else}
								{#each activeProjects as project (project.id)}
									{@const filteredSuggestions = getFilteredSuggestions(project.id)}
									{@const isExpanded = expandedProjects.has(project.id)}
									<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
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
										>
											<Collapsible.Trigger
												class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
											>
												<h2 class="font-semibold text-gray-800">{project.data.title}</h2>
												<Icon
													icon="lucide:chevron-down"
													class="h-4 w-4 transition-transform {isExpanded ? '' : '-rotate-90'}"
												/>
											</Collapsible.Trigger>
											<Collapsible.Content>
												<div class="flex flex-col gap-2 px-4 pb-4">
													{#if !projectSuggestions.has(project.id)}
														<p class="text-sm text-gray-400 italic">Loading suggestions...</p>
													{:else if filteredSuggestions.length === 0}
														<p class="text-sm text-gray-400 italic">No suggestions available</p>
													{:else}
														{#each filteredSuggestions as task (task.id)}
															<SuggestionListItem {task} {onTaskChange} onAddToToday={handleAddToToday} />
														{/each}
													{/if}
												</div>
											</Collapsible.Content>
										</Collapsible.Root>
									</div>
								{/each}
							{/if}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		</div>
	{:else}
		<!-- Desktop Layout: Side-by-side -->
		<div class="mx-auto flex h-full w-full gap-4 overflow-hidden p-4">
			<!-- Left Column: Project Suggestions -->
			<div
				bind:this={projectsPaneEl}
				class="flex w-1/2 flex-col gap-4 overflow-y-auto rounded-xl border-2 p-4 transition-all duration-200 {isDraggingOverProjects &&
				isValidDrop
					? 'border-solid border-green-500 bg-gradient-to-br from-green-50/15 to-green-50/10 shadow-lg'
					: 'border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100'}"
			>
				{#if activeProjects.length === 0}
					<div class="flex flex-1 items-center justify-center text-gray-500">
						<p class="italic">No active projects</p>
					</div>
				{:else}
					{#each activeProjects as project (project.id)}
						{@const filteredSuggestions = getFilteredSuggestions(project.id)}
						{@const isExpanded = expandedProjects.has(project.id)}
						<div class="rounded-lg border border-gray-200 bg-white shadow-sm">
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
							>
								<Collapsible.Trigger
									class="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
								>
									<h2 class="font-semibold text-gray-800">{project.data.title}</h2>
									<Icon
										icon="lucide:chevron-down"
										class="h-4 w-4 transition-transform {isExpanded ? '' : '-rotate-90'}"
									/>
								</Collapsible.Trigger>
								<Collapsible.Content>
									<div class="flex flex-col gap-2 px-4 pb-4">
										{#if !projectSuggestions.has(project.id)}
											<p class="text-sm text-gray-400 italic">Loading suggestions...</p>
										{:else if filteredSuggestions.length === 0}
											<p class="text-sm text-gray-400 italic">No suggestions available</p>
										{:else}
											{#each filteredSuggestions as task (task.id)}
												<SuggestionListItem {task} {onTaskChange} onAddToToday={handleAddToToday} />
											{/each}
										{/if}
									</div>
								</Collapsible.Content>
							</Collapsible.Root>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Right Column: Today's Tasks -->
			<div class="flex w-1/2 flex-col gap-4">
				<div
					bind:this={todaysDropZoneEl}
					class="relative flex flex-1 flex-col overflow-y-auto rounded-xl border-2 p-4 transition-all duration-200 {isDraggingOverTodays &&
					isValidDrop
						? 'border-solid border-green-500 bg-gradient-to-br from-green-50/15 to-green-50/10 shadow-lg'
						: 'border-dashed border-blue-200 bg-gradient-to-br from-blue-100 to-blue-200'}"
				>
					<h1
						class="mb-4 font-semibold text-gray-700 {isDraggingOverTodays && isValidDrop
							? 'text-green-700'
							: ''}"
					>
						Today's Tasks
					</h1>
					{#if sortedTodaysTasks.length === 0 && activeProjects.length > 0}
						<h4 class="my-2 text-gray-500 italic">Nothing here. Drag some suggestions in!</h4>
					{/if}
					<div class="flex h-full flex-col gap-2">
						{#each sortedTodaysTasks as task, index (task.id)}
							<TodayListItem
								bind:task={sortedTodaysTasks[index]}
								{onTaskChange}
								onRemoveFromToday={handleRemoveFromToday}
							/>
						{/each}
						{#if completedTodaysTasks.length > 0}
							<div class="flex w-full items-center gap-3 px-2 text-xs font-medium text-gray-400">
								<div
									class="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300"
								></div>
								<div class="flex items-center gap-1.5">
									<span class="tracking-wider uppercase">Completed</span>
									<span>({completedTodaysTasks.length})</span>
								</div>
								<div
									class="h-px flex-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300"
								></div>
							</div>
							{#each completedTodaysTasks as task, index (task.id)}
								<TodayListItem
									bind:task={completedTodaysTasks[index]}
									{onTaskChange}
									onRemoveFromToday={handleRemoveFromToday}
								/>
							{/each}
						{/if}
					</div>
				</div>

				{#if sortedTodaysTasks.length > 5}
					<div
						class="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center text-sm text-orange-700"
					>
						It's not recommended to go over 5 tasks in a day!
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style lang="scss">
	// Pragmatic-dnd provides its own ghost styling, but we can enhance it if needed
	:global([data-is-dragging='true']) {
		opacity: 0.5;
	}
</style>
