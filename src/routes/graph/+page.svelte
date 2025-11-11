<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteFlow, SvelteFlowProvider, Background, useSvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import TaskCreationDrawer from '../../lib/components/TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ResizablePaneGroup, ResizablePane, ResizableHandle } from '$lib/components/ui/resizable';
	import { createGraphController, type DrawerTrigger } from './graphController';
	import TaskEditor, { type TaskEditorLayoutState } from './TaskEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import { TaskStatus, type Task, type TaskBase } from '$domain/models/task';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import { page } from '$app/state';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import { authState } from '$lib/API/Auth';
	import { TaskSearchService } from '$lib/API/Tasks/TaskSearchService';
	import { tokenize } from '$lib/query/tokenizer';
	import { parseQuery, Parser } from '$lib/query/parser';
	import { QueryEvaluator } from '$lib/query/evaluator';
	import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';
	import SearchTaskListItem from './SearchTaskListItem.svelte';

	let selectedTask = $state<Task | null>(null);
	let allTasks = $state<Task[]>([]);
	let searchService: TaskSearchService | null = $state(null);
	let activeSearchResults = $state<Task[]>([]);
	let searchQuery = $state<string>('');
	let isStructuredQuery = $state(false); // Track if current query is structured (uses QueryEvaluator)
	let showRelatedNodes = $state(true);
	let relatedDepth = $state(-1); // -1 = unlimited, 1 = direct only, 2 = 2 levels, etc. TODO: Wire to user settings

	// UI State
	let editorLayoutState: TaskEditorLayoutState = $state({
		accordionValues: ['tasks'],
		showCompletedTasks: false,
		showCompletedSiblings: false
	});

	const controller = createGraphController();
	let drawerOpenStore = controller.drawerOpen;
	let nodesStore = controller.nodes;
	let edgesStore = controller.edges;
	let triggerTaskForNewStore = controller.triggerTaskForNew;
	let unsubscribeTasksStore: (() => void) | null = null;

	async function onTaskChange(original: Task, update: Partial<Task>) {
		const [_, error] = await tasksAPI.updateTask({ id: original.id, data: update });
		if (error) Err.UNHANDLED(error);
	}

	async function onDelete(task: Task) {
		selectedTask = null;
		const [_, error] = await tasksAPI.deleteTask({ id: task.id });
		if (error) Err.UNHANDLED(error, 'Failed to delete task');
	}

	function highlightNode(taskId: string, options: { select?: boolean } = { select: true }) {
		const node = $nodesStore.find((n) => n.id === taskId);
		if (node && node.data.type === 'task') {
			controller.centerNode(taskId);
			if (options?.select) {
				selectedTask = (node.data as unknown as Task | undefined) ?? null;
			}
		}
	}

	// TODO:refactor This should be derived from the result of parsing, not duplicated here
	function isPlainTextQuery(query: string): boolean {
		const trimmed = query.trim();
		if (!trimmed) return false;

		try {
			const tokens = tokenize(trimmed);
			const parser = new Parser(tokens);
			parser.parse();
			// If parsing succeeds and we have structured elements, not plain text
			return false;
		} catch {
			// Parse error means it's plain text
			return true;
		}
	}

	async function handleSearch(query: string): Promise<Task[]> {
		if (!searchService || !query.trim()) {
			// Clear search state when query is empty
			searchQuery = '';
			activeSearchResults = [];
			isStructuredQuery = false;
			return [];
		}

		let results: Task[] = [];

		if (isPlainTextQuery(query)) {
			// Plain text query - just return results for dropdown, don't affect graph
			results = searchService.searchTasks(query);
			isStructuredQuery = false;
			return results;
		} else {
			// Structured query - parse and evaluate
			try {
				const ast = parseQuery(query);
				const evaluator = new QueryEvaluator(taskQueryFieldRegistry);
				results = evaluator.evaluate(allTasks, ast);
				// Only update graph state for structured queries with results
				searchQuery = query;
				activeSearchResults = results;
				isStructuredQuery = true;
				return results;
			} catch (error) {
				// Parse/evaluation error - clear graph state, return empty results
				// TODO: Show error to user in UI
				console.error('Query evaluation error:', error);
				searchQuery = '';
				activeSearchResults = [];
				isStructuredQuery = false;
				return [];
			}
		}
	}

	$effect(() => {
		// Sync search service when tasks change
		if (allTasks.length > 0) {
			if (!searchService) {
				searchService = new TaskSearchService();
			}
			// Re-index all tasks
			allTasks.forEach((task) => searchService!.indexTask(task));
		}
	});

	$effect(() => {
		// Only update graph visibility for structured queries (QueryEvaluator) with results
		if (isStructuredQuery && activeSearchResults.length > 0) {
			// Structured query with results: filter to matching nodes (+ related if enabled)
			const matchingIds = new Set(activeSearchResults.map((t) => t.id));
			controller.setVisibleTaskIds(matchingIds, {
				includeRelated: showRelatedNodes,
				relatedDepth
			});
		} else {
			// Plain text query or no structured query results: show all nodes
			controller.setVisibleTaskIds(null);
		}
	});

	function handleSearchResultSelected(task: Task) {
		highlightNode(task.id, { select: true });
	}

	onMount(() => {
		controller.init();

		// Subscribe to tasks for the authenticated user
		const unsubAuth = authState.subscribe((auth) => {
			if (auth.status === 'signed-in') {
				unsubscribeTasksStore?.();
				unsubscribeTasksStore = tasksAPI
					.getAllUserTasks({ userId: auth.user.id })
					.subscribe(async (taskSub) => {
						if (taskSub.status === 'resolved') {
							allTasks = taskSub.data;
							await controller.updateTasks(taskSub.data);
						}
					});
			} else {
				unsubscribeTasksStore?.();
				unsubscribeTasksStore = null;
				allTasks = [];
			}
		});

		// Handle URL params for highlighting
		const params = page.url.searchParams;
		const highlightId = params.get('highlight');
		const shouldSelect = params.get('select') === 'true';

		if (highlightId) {
			// Defer until graph is laid out
			setTimeout(() => {
				highlightNode(highlightId, { select: shouldSelect });
			}, 500);
		}

		return () => {
			unsubAuth();
		};
	});

	onDestroy(() => {
		unsubscribeTasksStore?.();
		controller.destroy();
	});

	// no utility functions; inline SvelteFlow init below
</script>

<div class="graph-root page-root">
	<div class="h-header bg-white p-2">
		<div class="flex items-center gap-2">
			<div class="flex-1">
				<SearchBar
					placeholder="Enter query here..."
					handleQuery={handleSearch}
					onItemSelected={handleSearchResultSelected}
					autocomplete={false}
					sorter={(a, b) => {
						if (a.status == TaskStatus.complete) return 1;
						else if (b.status == TaskStatus.complete) return -1;
						else return 0;
					}}
				>
					{#snippet children(task: TaskBase)}
						<SearchTaskListItem
							{task}
							onLocate={() => {
								highlightNode(task.id, { select: false });
							}}
						/>
					{/snippet}
				</SearchBar>
			</div>
			{#if isStructuredQuery && activeSearchResults.length > 0}
				<Button
					variant={showRelatedNodes ? 'default' : 'outline'}
					size="sm"
					onclick={() => {
						showRelatedNodes = !showRelatedNodes;
					}}
				>
					{showRelatedNodes ? 'Hide' : 'Show'} Related
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
							bind:nodes={$nodesStore}
							bind:edges={$edgesStore}
							fitView
							minZoom={0.1}
							maxZoom={2}
							nodeTypes={{ task: TaskNode }}
							nodeOrigin={[0.5, 0.5]}
							edgeTypes={{ task: TaskEdge }}
							defaultEdgeOptions={{ type: 'task' }}
							oninit={() => {
								const instance = useSvelteFlow();
								controller.setScreenToFlowPosition(instance.screenToFlowPosition);
								controller.setSvelteFlowInstance(instance);
							}}
							ondelete={({ nodes, edges }) => {
								selectedTask = null;
								controller.handlers.handleDelete({ nodes, edges });
							}}
							onconnectstart={controller.handlers.handleConnectStart}
							onreconnectstart={controller.handlers.handleReconnectStart}
							onconnect={controller.handlers.handleConnect}
							onbeforereconnect={controller.handlers.handleBeforeReconnect}
							onreconnect={controller.handlers.handleReconnect}
							onconnectend={controller.handlers.handleConnectEnd}
							onreconnectend={controller.handlers.handleReconnectEnd}
							isValidConnection={controller.handlers.isValidConnection}
							onnodeclick={({ node, event }) => {
								// Only change if it's a plain single click (no multi-select modifiers)
								if (event?.shiftKey || event?.metaKey || event?.ctrlKey) return;
								selectedTask = node.id
									? (($nodesStore.find((n) => n.id === node.id)?.data as Task | undefined) ?? null)
									: null;
							}}
							onpaneclick={() => {
								selectedTask = null;
							}}
						>
							<Background bgColor="var(--background)" />
						</SvelteFlow>
						<Button
							variant="outline"
							class="absolute right-6 bottom-6 h-9 w-10 rounded-full border-1 border-border bg-white"
							onclick={() => {
								controller.setTriggerTaskForNew(null);
								controller.setDrawerOpen(true);
							}}
						>
							+
						</Button>
					</div>
				</SvelteFlowProvider>
			</ResizablePane>
			{#if selectedTask}
				<ResizableHandle />
				<ResizablePane
					class="flex h-full flex-col border-l border-gray-200 bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"
					defaultSize={30}
					minSize={24}
				>
					<ScrollArea class="h-full">
						<TaskEditor
							bind:task={selectedTask}
							bind:layoutState={editorLayoutState}
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

<TaskCreationDrawer bind:open={$drawerOpenStore} relation={$triggerTaskForNewStore} />

<style>
	:global(.svelte-flow__attribution) {
		display: none;
	}

	/* Ensure edge reconnect anchors are always clickable above nodes */
	:global(.svelte-flow__edgeupdater) {
		z-index: 20;
		pointer-events: all;
	}
</style>
