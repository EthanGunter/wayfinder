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
	import { page } from '$app/stores';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import { authState } from '$lib/API/Auth';
	import { TaskSearchService } from '$lib/API/Tasks/TaskSearchService';
	import { tokenize } from '../dev/search/tokenizer';
	import { Parser } from '../dev/search/parser';
	import SearchTaskListItem from './SearchTaskListItem.svelte';

	let selectedTask = $state<Task | null>(null);
	let allTasks = $state<Task[]>([]);
	let searchService: TaskSearchService | null = $state(null);

	// UI State
	let editorLayoutState: TaskEditorLayoutState = $state({ accordionValues: ['tasks'] });

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
		const [_, error] = await tasksAPI.deleteTask({ id: task.id });
		if (error) Err.UNHANDLED(error, 'Failed to delete task');
		selectedTask = null;
	}

	function highlightNode(taskId: string, options: { select?: boolean } = { select: true }) {
		controller.centerNode(taskId);
		if (options?.select) {
			const node = $nodesStore.find((n) => n.id === taskId);
			selectedTask = (node?.data as Task | undefined) ?? null;
		}
	}

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
		if (!searchService || !query.trim()) return [];

		if (isPlainTextQuery(query)) {
			const results = searchService.searchTasks(query);
			return results;
		}

		// Structured queries not yet implemented
		console.log('Structured query not yet supported:', query);
		return [];
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

	function handleSearchResultSelected(task: Task) {
		highlightNode(task.id, { select: true }); // TODO:Test should we select the task?
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
		const params = $page.url.searchParams;
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
							ondelete={controller.handlers.handleDelete}
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
