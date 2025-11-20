<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteFlow, SvelteFlowProvider, Background, useSvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import TaskCreationDrawer from '../../lib/components/TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Resizable from '$lib/components/ui/resizable';
	import TaskEditor from './TaskEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import { TaskStatus, type Task } from '$domain/models/task';
	import { page } from '$app/state';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchTaskListItem from '../../lib/components/ui/task-searchbar/SearchTaskListItem.svelte';
	import Icon from '@iconify/svelte';

	import {
		allTasks,
		edges,
		nodes,
		screenToFlowPosition,
		svelteFlowInstance,
		taskById
	} from './logic/shared-state';
	import { refreshNodesData, updateGraph } from './logic/graph';
	import {
		initializeFromUrl,
		highlightNode,
		handleShare,
		centerAndHighlightNode
	} from './logic/navigation';
	import {
		handleSearch,
		filteredIds,
		searchQuery,
		activeSearchResults,
		isValidQuery,
		showRelatedNodes,
		relatedDepth,
		recomputeFilters
	} from './logic/search';
	import {
		handleDelete,
		handleConnectStart,
		handleReconnectStart,
		handleConnect,
		handleBeforeReconnect,
		handleReconnect,
		handleConnectEnd,
		handleReconnectEnd,
		isValidConnection
	} from './logic/svelte-flow';
	import { selectedTask as selectedNode, editorLayoutState, drawerParams, drawerOpen } from './logic/ui-state';
	import type { FlowNode, FlowEdge } from './types';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import TaskSearchBar from '$lib/components/ui/task-searchbar/TaskSearchBar.svelte';

	let unsubscribeTasksStore: (() => void) | null = null;
	let didRunInitialLayout = false;

	onMount(() => {
		unsubscribeTasksStore = tasksAPI.getAllUserTasks().subscribe(async (taskSub) => {
			if (taskSub.status !== 'resolved') return;

			// always keep stores current
			refreshNodesData(taskSub.value);

			// only do layout once on first data load
			if (!didRunInitialLayout) {
				didRunInitialLayout = true;
				await updateGraph(true);

				// conditionally seed search from current URL or query store
				if ($searchQuery?.trim()) {
					await handleSearch($searchQuery);
				}
			}
		});

		initializeFromUrl(page.url.searchParams);
		return () => {
			unsubscribeTasksStore?.();
		};
	});

	onDestroy(() => {
		unsubscribeTasksStore?.();
	});

	$effect(() => {
		// dependencies to recompute filters when search state changes
		$activeSearchResults;
		$isValidQuery;
		$showRelatedNodes;
		$relatedDepth;

		// If you also want filters cleared when there are no tasks, you can check $allTasks here
		// but do not call updateGraph in this effect.
		recomputeFilters();
	});

	async function onTaskChange(original: Task, update: Partial<Task>) {
		const [_, err] = await tasksAPI.updateTask({ id: original.id, ...update });
		if (err) err.UNHANDLED();
	}

	function onGraphDelete(params: { nodes: FlowNode[]; edges: FlowEdge[] }): void {
		if (params.nodes.length === 1) {
			const task = params.nodes[0].data.wfNode;
			const parent = taskById.get(task.parents[0]);
			$selectedNode = parent ?? null;
		} else {
			$selectedNode = null;
		}
		handleDelete({ nodes: params.nodes, edges: params.edges });
	}

	async function onEditorDelete(task: Task) {
		const parent = taskById.get(task.parents[0]);
		$selectedNode = parent ?? null;
		await tasksAPI.deleteTask({ id: task.id });
	}

	function onSelectNode(taskId: string) {
		$selectedNode = $allTasks.find((t) => t.id === taskId) ?? null;
		centerAndHighlightNode(taskId);
	}
</script>

<AppHeader>
	<TaskSearchBar
		class="my-2 mr-4 ml-auto max-w-md justify-self-end"
		onTaskSelected={(t) => onSelectNode(t.id)}
	/>
</AppHeader>
<Resizable.PaneGroup direction="horizontal" class="flex min-h-0">
	<Resizable.Pane class="flex min-h-0 min-w-0" defaultSize={70} minSize={40}>
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
					ondelete={onGraphDelete}
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
						$selectedNode = node.id
							? ($nodes.find((n) => n.id === node.id)?.data.wfNode ?? null)
							: null;
					}}
					onpaneclick={() => {
						$selectedNode = null;
					}}
				>
					<Background bgColor="var(--background)" />
				</SvelteFlow>
				<Button
					variant="outline"
					class="absolute right-6 bottom-6 h-9 w-10 rounded-full border-1 border-border bg-white"
					onclick={() => {
						drawerParams.set(null);
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
	</Resizable.Pane>
	{#if $selectedNode}
		<Resizable.Handle />
		<Resizable.Pane
			class="flex h-full min-h-0 flex-col border-l border-gray-200 bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"
			defaultSize={30}
			minSize={24}
		>
			<TaskEditor
				bind:task={$selectedNode}
				bind:layoutState={$editorLayoutState}
				{onTaskChange}
				onDelete={onEditorDelete}
				{onSelectNode}
			/>
		</Resizable.Pane>
	{/if}
</Resizable.PaneGroup>

<TaskCreationDrawer
	bind:open={$drawerOpen}
	relation={$drawerParams?.relation}
	relationMode={$drawerParams?.mode}
/>

<style>
	:global(.svelte-flow__attribution) {
		display: none;
	}

	:global(.svelte-flow__edgeupdater) {
		z-index: 20;
		pointer-events: all;
	}
</style>
