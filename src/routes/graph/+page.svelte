<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteFlow, SvelteFlowProvider, Background, useSvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import TaskCreationDrawer from '../../lib/components/TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { ResizablePaneGroup, ResizablePane, ResizableHandle } from '$lib/components/ui/resizable';
	import { createGraphController, type DrawerTrigger } from './graphController';
	import TaskEditor, { type TaskEditorLayoutState } from './TaskEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import type { Task } from '$domain/models/task';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';

	let selectedTask = $state<Task | null>(null);

	// UI State
	let editorLayoutState: TaskEditorLayoutState = $state({ accordionValues: [] });


	const controller = createGraphController();
	let drawerOpenStore = controller.drawerOpen;
	let nodesStore = controller.nodes;
	let edgesStore = controller.edges;
	let triggerTaskForNewStore = controller.triggerTaskForNew;

	async function onTaskChange(original: Task, update: Partial<Task>) {
		const [_, error] = await tasksAPI.updateTask({ id: original.id, data: update });
		if (error) Err.UNHANDLED(error);
	}

	async function onDelete(task: Task) {
		const [_, error] = await tasksAPI.deleteTask({ id: task.id });
		if (error) Err.UNHANDLED(error, 'Failed to delete task');
		selectedTask = null;
	}

	onMount(() => {
		controller.init();
	});
	onDestroy(() => {
		controller.destroy();
	});

	// no utility functions; inline SvelteFlow init below
</script>

<div class="graph-root page page-root">
	<AppHeader>{#snippet center()}{/snippet}</AppHeader>
	<div class="flex min-h-0 flex-1">
		<ResizablePaneGroup direction="horizontal" class="flex h-full min-h-0 w-full">
			<ResizablePane class="flex min-h-0 min-w-0" defaultSize={70} minSize={40}>
				<SvelteFlowProvider>
					<div class="relative flex h-full w-full">
						<SvelteFlow
							class="h-full w-full"
							bind:nodes={$nodesStore}
							bind:edges={$edgesStore}
							fitView
							nodeTypes={{ task: TaskNode }}
							nodeOrigin={[0.5, 0.5]}
							edgeTypes={{ task: TaskEdge }}
							defaultEdgeOptions={{ type: 'task' }}
							oninit={() => {
								const { screenToFlowPosition } = useSvelteFlow();
								controller.setScreenToFlowPosition(screenToFlowPosition);
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
							<Background />
						</SvelteFlow>
						<Button
							variant="outline"
							class="absolute right-6 bottom-6 rounded-full border-2"
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
						/>
					</ScrollArea>
				</ResizablePane>
			{/if}
		</ResizablePaneGroup>
	</div>
	<AppFooter />
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
