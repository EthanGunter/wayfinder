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
	import { parseQuery } from '$lib/query/parser';
	import { QueryEvaluator } from '$lib/query/evaluator';
	import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';
	import SearchTaskListItem from './SearchTaskListItem.svelte';
	import Icon from '@iconify/svelte';

	let selectedTask = $state<Task | null>(null);
	let allTasks = $state<Task[]>([]);
	let activeSearchResults = $state<Task[]>([]);
	let searchQuery = $state<string>('');
	let isStructuredQuery = $state(false); // Track if current query is structured (uses QueryEvaluator)
	let showRelatedNodes = $state(true);
	let relatedDepth = $state(-1); // -1 = unlimited, 1 = direct only, 2 = 2 levels, etc.

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

	onMount(() => {
		controller.init();

		// Subscribe to tasks for the authenticated user
		const unsubAuth = authState.subscribe(async (auth) => {
			if (auth.status === 'signed-in') {
				unsubscribeTasksStore?.();
				unsubscribeTasksStore = tasksAPI
					.getAllUserTasks({ userId: auth.user.id })
					.subscribe(async (taskSub) => {
						if (taskSub.status === 'resolved') {
							allTasks = taskSub.data;
							await controller.updateTasks(taskSub.data);

							// If there was a q param provided before tasks loaded, re-run search now
							if (searchQuery?.trim()) {
								// fire and forget; state updates inside
								handleSearch(searchQuery);
							}
						}
					});
			} else {
				unsubscribeTasksStore?.();
				unsubscribeTasksStore = null;
				allTasks = [];
			}
		});

		controller.updateGraph();

		// Handle URL params for query and selection
		const params = page.url.searchParams;
		const selectId = params.get('select');
		const qParam = params.get('q');
		const showRelated = params.get('related');

		// Initialize related toggle if provided
		if (showRelated != null) {
			// accept "0" or "false" to disable
			const normalized = showRelated.toLowerCase();
			showRelatedNodes = !(normalized === '0' || normalized === 'false');
		}

		if (qParam) {
			// Prime UI and run initial search immediately
			searchQuery = qParam;
			// Run once now (works for structured queries); will re-run once tasks arrive
			handleSearch(qParam);
		}

		if (selectId) {
			// Defer until graph is laid out
			setTimeout(() => {
				highlightNode(selectId, { select: true });
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

	$effect(() => {
		if (allTasks.length === 0) {
			// tasks not loaded yet: do not apply visibility filter
			controller.setVisibleTaskIds(null);
			return;
		}

		if (isStructuredQuery && activeSearchResults.length > 0) {
			const matchingIds = new Set(activeSearchResults.map((t) => t.id));
			controller.setVisibleTaskIds(matchingIds, {
				includeRelated: showRelatedNodes,
				relatedDepth
			});
		} else {
			controller.setVisibleTaskIds(null);
		}
	});

	function buildShareUrl({ q }: { q: string }) {
		const url = new URL(window.location.href);
		if (q?.trim()) url.searchParams.set('q', q);
		else url.searchParams.delete('q');

		// Include related toggle for completeness
		url.searchParams.set('related', showRelatedNodes ? '1' : '0');

		// We are not using highlight for now, ensure it's removed
		url.searchParams.delete('highlight');

		return url.toString();
	}

	function replaceUrl(url: string) {
		// no history entry spam on share: replace not push
		window.history.replaceState({}, '', url);
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return false;
		}
	}

	async function handleShare() {
		const q = searchQuery ?? '';
		const url = buildShareUrl({ q });
		replaceUrl(url);
		await copyToClipboard(url);
		// Optionally trigger a toast/snackbar here
	}

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

	// Pure AST-first search with simple linear fallback (title/content contains)
	async function handleSearch(query: string): Promise<Task[]> {
		searchQuery = query;

		const trimmed = query.trim();
		if (!trimmed) {
			activeSearchResults = [];
			isStructuredQuery = false;
			return [];
		}

		// 1) Try structured AST first
		try {
			const ast = parseQuery(trimmed);
			const evaluator = new QueryEvaluator(taskQueryFieldRegistry);
			const results = evaluator.evaluate(allTasks, ast);
			activeSearchResults = results;
			isStructuredQuery = true;
			return results;
		} catch {
			// 2) Fallback: simple linear contains search over title/content
			isStructuredQuery = false;
			const ql = trimmed.toLowerCase();
			const results =
				allTasks.length === 0
					? []
					: allTasks.filter(
							(t) =>
								(t.title && t.title.toLowerCase().includes(ql)) ||
								(t.content && t.content.toLowerCase().includes(ql))
						);
			activeSearchResults = results;
			return results;
		}
	}

	function handleSearchResultSelected(task: Task) {
		highlightNode(task.id, { select: true });
	}
</script>

<div class="graph-root page-root">
	<div class="h-header bg-white p-2">
		<div class="flex items-center gap-2">
			<div class="flex-1">
				<SearchBar
					bind:query={searchQuery}
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
								// When the user “locates” a result, update selectedTask and leave a breadcrumb
								selectedTask = allTasks.find((t) => t.id === task.id) ?? null;
								highlightNode(task.id, { select: false });
							}}
						/>
					{/snippet}
				</SearchBar>
			</div>

			<!-- Share is available whenever a query exists -->
			<Button
				variant="outline"
				size="sm"
				onclick={handleShare}
				disabled={!searchQuery?.trim()}
				title="Copy a shareable URL for this query"
			>
				Share
			</Button>

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
						<Button
							variant="outline"
							class="absolute top-6 right-6 h-9 w-10 rounded-full border-1 border-border bg-white"
							onclick={() => {
								controller.updateGraph();
							}}
						>
							<Icon icon="lucide:refresh-cw" />
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
