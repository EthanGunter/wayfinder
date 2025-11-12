<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { SvelteFlow, SvelteFlowProvider, Background, useSvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import TaskCreationDrawer from '../../lib/components/TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ResizablePaneGroup, ResizablePane, ResizableHandle } from '$lib/components/ui/resizable';
	import TaskEditor from './TaskEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import { TaskStatus, type Task, type ITask } from '$domain/models/task';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import { page } from '$app/state';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchTaskListItem from './SearchTaskListItem.svelte';
	import Icon from '@iconify/svelte';

	import {
		allTasks,
		taskById,
		nodes,
		edges,
		svelteFlowInstance,
		screenToFlowPosition
	} from './util/core-state';
	import { selectedTask, drawerOpen, triggerForNew, editorLayoutState } from './util/ui-state';

	import {
		searchQuery,
		activeSearchResults,
		isStructuredQuery,
		showRelatedNodes,
		filters,
		handleSearch,
		computeSearchFilter,
		relatedDepth
	} from './util/search';

	import { updateGraph, handleShare, initializeFromUrl } from './util/page-controller';

	// Flow event handlers
	import {
		isValidConnection,
		handleConnectStart,
		handleReconnectStart,
		handleConnect,
		handleBeforeReconnect,
		handleReconnect,
		handleConnectEnd,
		handleReconnectEnd,
		handleDelete
	} from './util/flow-events';

	import { highlightNode } from './util/appearance';

	let unsubscribeTasksStore: (() => void) | null = null;

	onMount(() => {
		unsubscribeTasksStore = tasksAPI.getAllUserTasks({}).subscribe(async (taskSub) => {
			if (taskSub.status === 'resolved') {
				allTasks.set(taskSub.data);

				taskById.clear();
				for (const t of taskSub.data) taskById.set(t.id, t);

				await updateGraph(true);

				if ($searchQuery?.trim()) {
					await handleSearch($searchQuery);
				}
			}
		});

		initializeFromUrl(page.url.searchParams);
	});

	onDestroy(() => {
		unsubscribeTasksStore?.();
	});

	$effect(() => {
		// Track all dependencies of the computeSearchFilter function
		$activeSearchResults;
		$isStructuredQuery;
		$showRelatedNodes;
		$relatedDepth;

		if ($allTasks.length === 0) {
			if ($filters !== null) {
				filters.set(null);
				updateGraph(true);
			}
			return;
		}

		const newFilter = computeSearchFilter();
		const currentFilter = $filters;

		const filterChanged =
			(currentFilter === null) !== (newFilter === null) ||
			(currentFilter !== null &&
				newFilter !== null &&
				(currentFilter.matching.size !== newFilter.matching.size ||
					currentFilter.related.size !== newFilter.related.size ||
					[...currentFilter.matching].some((id) => !newFilter.matching.has(id)) ||
					[...currentFilter.related].some((id) => !newFilter.related.has(id))));

		if (filterChanged) {
			filters.set(newFilter);
			updateGraph(true);
		}
	});

	async function onTaskChange(original: Task, update: Partial<Task>) {
		(await tasksAPI.updateTask({ id: original.id, data: update }))[1]?.UNHANDLED();
	}

	async function onDelete(task: Task) {
		selectedTask.set(null);
		await tasksAPI.deleteTask({ id: task.id });
	}
</script>

<div class="graph-root page-root">
	<div class="h-header bg-white p-2">
		<div class="flex items-center gap-2">
			<div class="flex-1">
				<SearchBar
					bind:query={$searchQuery}
					placeholder="Enter query here..."
					handleQuery={handleSearch}
					onItemSelected={(task) => highlightNode(task.id, { select: true })}
					autocomplete={false}
					sorter={(a, b) => {
						if (a.status == TaskStatus.complete) return 1;
						else if (b.status == TaskStatus.complete) return -1;
						else return 0;
					}}
				>
					{#snippet children(task: ITask)}
						<SearchTaskListItem
							{task}
							onLocate={() => {
								$selectedTask = $allTasks.find((t) => t.id === task.id) ?? null;
								highlightNode(task.id, { select: false });
							}}
						/>
					{/snippet}
				</SearchBar>
			</div>

			<Button
				variant="outline"
				size="sm"
				onclick={handleShare}
				disabled={!$searchQuery?.trim()}
				title="Copy a shareable URL for this query"
			>
				Share
			</Button>

			{#if $isStructuredQuery && $activeSearchResults.length > 0}
				<Button
					variant={$showRelatedNodes ? 'default' : 'outline'}
					size="sm"
					onclick={() => {
						$showRelatedNodes = !$showRelatedNodes;
					}}
				>
					{$showRelatedNodes ? 'Hide' : 'Show'} Related
				</Button>
			{/if}
		</div>
	</div>
	<div class="flex min-h-0 flex-1 flex-col">
		<ResizablePaneGroup direction="horizontal" class="flex h-full min-h-0 w-full">
			<ResizablePane class="flex min-h-0 min-w-0" defaultSize={70} minSize={40}>
				<SvelteFlowProvider>
					<div class="relative flex h-full w-full">
						<SvelteFlow
							class="h-full w-full"
							bind:nodes={$nodes}
							bind:edges={$edges}
							fitView
							minZoom={0.1}
							maxZoom={2}
							nodeTypes={{ task: TaskNode }}
							nodeOrigin={[0.5, 0.5]}
							edgeTypes={{ task: TaskEdge }}
							defaultEdgeOptions={{ type: 'task' }}
							oninit={() => {
								const instance = useSvelteFlow();
								svelteFlowInstance.set(instance);
								screenToFlowPosition.set(instance.screenToFlowPosition);
							}}
							ondelete={({ nodes, edges }) => {
								$selectedTask = null;
								handleDelete({ nodes, edges });
							}}
							onconnectstart={handleConnectStart}
							onreconnectstart={handleReconnectStart}
							onconnect={handleConnect}
							onbeforereconnect={handleBeforeReconnect}
							onreconnect={handleReconnect}
							onconnectend={handleConnectEnd}
							onreconnectend={handleReconnectEnd}
							{isValidConnection}
							onnodeclick={({ node, event }) => {
								if (event?.shiftKey || event?.metaKey || event?.ctrlKey) return;
								$selectedTask = node.id
									? (($nodes.find((n) => n.id === node.id)?.data as Task | undefined) ?? null)
									: null;
							}}
							onpaneclick={() => {
								$selectedTask = null;
							}}
						>
							<Background bgColor="var(--background)" />
						</SvelteFlow>
						<Button
							variant="outline"
							class="absolute right-6 bottom-6 h-9 w-10 rounded-full border-1 border-border bg-white"
							onclick={() => {
								triggerForNew.set(null);
								drawerOpen.set(true);
							}}
						>
							+
						</Button>
						<Button
							variant="outline"
							class="absolute top-6 right-6 h-9 w-10 rounded-full border-1 border-border bg-white"
							onclick={() => {
								updateGraph(true);
							}}
						>
							<Icon icon="lucide:refresh-cw" />
						</Button>
					</div>
				</SvelteFlowProvider>
			</ResizablePane>
			{#if $selectedTask}
				<ResizableHandle />
				<ResizablePane
					class="flex h-full flex-col border-l border-gray-200 bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"
					defaultSize={30}
					minSize={24}
				>
					<ScrollArea class="h-full">
						<TaskEditor
							bind:task={$selectedTask}
							bind:layoutState={$editorLayoutState}
							{onTaskChange}
							{onDelete}
							onHighlightNode={highlightNode}
						/>
					</ScrollArea>
				</ResizablePane>
			{/if}
		</ResizablePaneGroup>
	</div>
</div>

<TaskCreationDrawer bind:open={$drawerOpen} relation={$triggerForNew} />

<style>
	:global(.svelte-flow__attribution) {
		display: none;
	}

	:global(.svelte-flow__edgeupdater) {
		z-index: 20;
		pointer-events: all;
	}
</style>
