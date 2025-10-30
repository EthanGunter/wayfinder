<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Background,
		Position,
		type Node,
		type Edge,
		useSvelteFlow,
		type OnConnectEnd,
		type OnReconnectEnd,
		type Connection
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import TaskCreationDrawer from '../tasks/TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import { layoutTasksWithElk } from './layoutEngine';
	import {
		updateTaskRelationship,
		refreshNodeData,
		refreshSpecificNodes,
		wouldCreateCycle,
		connectionExists,
		removeDuplicateEdges,
		getFlowPointFromEvent
	} from './graphNodeHandlers';
	import { SvelteMap } from 'svelte/reactivity';
	import { tutorials } from '$lib/tutorials/store';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { Task, TaskDelta } from '$domain/models/task';
	import { Err } from '$domain/errors';

	let taskById = new SvelteMap<string, Task>();
	let unsubscribeTasks: (() => void) | null = null;
	let unsubscribeAuth: (() => void) | null = null;

	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);

	// UI State
	let drawerOpen = $state(false);
	let triggerTaskForNew = $state<{ task: Task; mode: 'parent' | 'child' } | null>(null);

	// Connection State
	let connectionState = $state({
		successful: false,
		sourceNodeId: null as string | null,
		handleType: null as string | null,
		dropPosition: null as { x: number; y: number } | null
	});

	// Reconnection State
	let reconnectionState = $state({
		successful: false,
		detachEnd: null as 'source' | 'target' | null,
		oldEdge: null as Edge | null,
		inProgress: false
	});

	let screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | null =
		null;

	onMount(async () => {
		if (!tutorials.isDone('home.welcome')) {
			goto('/planner');
			return;
		}

		// Subscribe to auth state
		unsubscribeAuth = authState.subscribe((state) => {
			if (state.status === 'signed-in') {
				unsubscribeTasks?.();
				unsubscribeTasks = tasksAPI.subscribeTasks({
					userId: state.user.id,
					onInitialize: async (tasks) => {
						taskById = new SvelteMap(tasks.map((t) => [t.id, t]));
						await rebuildLayoutFromMap();
					},
					onChange: async (changes) => {
						applyDeltas(changes);
					}
				});
			}
		});
	});
	onDestroy(() => {
		unsubscribeTasks?.();
		unsubscribeAuth?.();
	});

	function applyDeltas(changes: TaskDelta[]) {
		for (const change of changes) {
			if (change.newTask) {
				taskById.set(change.newTask.id, change.newTask);
			} else if (!change.newTask && change.oldTask) {
				taskById.delete(change.oldTask.id);
			}
		}
		// TODO:design this is a heavy-handed solution to keep the UI in sync with the data.
		// We must either prevent the user from laying out the graph how they please 🤮
		// or figure out a way to allow the modification of nodes without recalculating...
		void rebuildLayoutFromMap();
	}

	async function rebuildLayoutFromMap() {
		const allTasks = Array.from(taskById.values());
		const graph = await layoutTasksWithElk(allTasks, { direction: 'DOWN' });
		nodes = graph.nodes;
		edges = graph.edges;
	}

	//#region Svelteflow handlers

	function initializeFlow() {
		const { screenToFlowPosition: svelteFlowPosition } = useSvelteFlow();
		screenToFlowPosition = svelteFlowPosition;
	}

	function isValidConnection(connection: { source?: string; target?: string }) {
		const parentId = connection?.source ?? '';
		const childId = connection?.target ?? '';
		if (!parentId || !childId) return false;
		if (parentId === childId) return false;

		if (!reconnectionState.inProgress) {
			const sourceTask = taskById.get(parentId);
			if (sourceTask?.children.includes(childId)) return false;

			const childTask = taskById.get(childId);
			if (childTask?.parents.includes(parentId)) return false;
		}
		return !wouldCreateCycle(parentId, childId, edges);
	}

	//#region Edge connection handlers

	function handleConnectStart(
		event: MouseEvent | TouchEvent,
		params: { nodeId: string | null; handleId: string | null; handleType: any }
	) {
		if (reconnectionState.inProgress) {
			return;
		}
		connectionState.sourceNodeId = params?.nodeId ?? null;
		connectionState.handleType = params?.handleType ?? null;
		connectionState.successful = false;
	}
	function handleReconnectStart(
		event: MouseEvent | TouchEvent,
		edge: Edge,
		handleType: 'source' | 'target'
	) {
		reconnectionState.successful = false;
		reconnectionState.detachEnd = handleType;
		reconnectionState.oldEdge = edge;
		reconnectionState.inProgress = true;
	}

	async function handleConnect(connection: Connection) {
		connectionState.successful = true;
		try {
			const parentId: string | undefined = connection?.source;
			const childId: string | undefined = connection?.target;
			if (!parentId || !childId || parentId === childId) return;

			// Cycles prevented by isValidConnection
			await updateTaskRelationship(tasksAPI, taskById, parentId, childId, 'add');
			// Refresh affected nodes
			nodes = refreshSpecificNodes(nodes, taskById, [parentId, childId]);
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to create connection');
		}
	}
	function handleBeforeReconnect(reconnectedEdge: Edge, oldEdge: Edge): Edge | false {
		const newSource = String(reconnectedEdge.source ?? oldEdge.source ?? '');
		const newTarget = String(reconnectedEdge.target ?? oldEdge.target ?? '');
		if (!newSource || !newTarget) return false;
		if (newSource === newTarget) return false;
		// if (wouldCreateCycle(newSource, newTarget, edges)) return false; // Checked in isValidConnection
		// Preserve custom edge type
		return { ...reconnectedEdge, type: (oldEdge as any).type ?? 'task' } as Edge;
	}
	async function handleReconnect(
		oldEdge: Edge,
		newConnection: { source?: string; target?: string }
	) {
		reconnectionState.successful = true;
		try {
			const oldSource = String(oldEdge.source);
			const oldTarget = String(oldEdge.target);
			const newSource = String(newConnection?.source ?? oldSource);
			const newTarget = String(newConnection?.target ?? oldTarget);

			if (!newSource || !newTarget) return;
			if (newSource === oldSource && newTarget === oldTarget) return;
			// if (wouldCreateCycle(newSource, newTarget, edges)) return; // Checked in isValidConnection

			// Remove old relationship
			await updateTaskRelationship(tasksAPI, taskById, oldSource, oldTarget, 'remove');

			// Add new relationship if not duplicate
			if (!connectionExists(edges, newSource, newTarget)) {
				await updateTaskRelationship(tasksAPI, taskById, newSource, newTarget, 'add');
			} else {
				// Remove duplicate edges
				edges = removeDuplicateEdges(edges);
			}

			// Refresh all node data
			nodes = refreshNodeData(nodes, taskById);
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to handle reconnect');
		}
	}

	const handleConnectEnd: OnConnectEnd = (event, connectState) => {
		if (reconnectionState.inProgress) {
			connectionState.sourceNodeId = null;
			connectionState.handleType = null;
			connectionState.successful = false;
			return;
		}

		if (!connectionState.successful && connectionState.sourceNodeId) {
			// If user dropped onto a handle but the connection was invalid, do NOT open create drawer
			if (connectState.toHandle || connectState.toNode) {
				// no-op; just cancel
			} else {
				// Open task creation drawer
				const dropPos = getFlowPointFromEvent(event, screenToFlowPosition) || null;
				connectionState.dropPosition = dropPos;

				const triggerTask = taskById.get(connectionState.sourceNodeId) || null;
				if (triggerTask) {
					triggerTaskForNew = {
						task: triggerTask,
						mode: connectionState.handleType === 'source' ? 'parent' : 'child'
					};
					drawerOpen = true;
				}
			}
		}
		// Reset connection state
		connectionState.sourceNodeId = null;
		connectionState.handleType = null;
		connectionState.successful = false;
	};
	const handleReconnectEnd: OnReconnectEnd = async (event, edge, _handleType, connectState) => {
		try {
			// If not successful, only delete when truly dropped on the pane (no target handle)
			if (!reconnectionState.successful) {
				const droppedOnHandle =
					(event as Event)?.target && (event.target as Element).closest?.('.svelte-flow__handle');
				const hasTarget = Boolean(connectState?.toNode || connectState?.toHandle);

				if (!droppedOnHandle && !hasTarget) {
					// Delete the relationship when dropped on empty space
					const src = String(edge.source);
					const tgt = String(edge.target);
					await updateTaskRelationship(tasksAPI, taskById, src, tgt, 'remove');

					// Remove the edge visually
					edges = edges.filter((e) => e.id !== edge.id);
					nodes = refreshNodeData(nodes, taskById);
				}
			}
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to finalize reconnect');
		} finally {
			// Reset reconnection state
			reconnectionState.successful = false;
			reconnectionState.detachEnd = null;
			reconnectionState.oldEdge = null;
			reconnectionState.inProgress = false;
		}
	};

	//#endregion

	async function handleDelete(params: { nodes: Node[]; edges: Edge[] }): Promise<void> {
		if (params.nodes.length > 0) {
			// Delete tasks from backend
			// TODO:GraphUX Ask user whether to delete recursivly OR automatically connect children to parent on node deletion
			await tasksAPI.deleteTasks({ ids: params.nodes.map((n) => n.id) });
		}
		if (params.edges.length > 0) {
			// Convert deleted edges to relationship changes
			const relationChanges = new Map<
				string,
				{ id: string; operation: 'removeChild' | 'removeParent' | 'addChild' | 'addParent' }[]
			>();

			for (const edge of params.edges) {
				const sourceId = edge.source;
				const targetId = edge.target;

				// Remove child relationship from source (parent)
				if (!relationChanges.has(sourceId)) {
					relationChanges.set(sourceId, []);
				}
				relationChanges.get(sourceId)!.push({ id: targetId, operation: 'removeChild' as const });

				// Remove parent relationship from target (child)
				if (!relationChanges.has(targetId)) {
					relationChanges.set(targetId, []);
				}
				relationChanges.get(targetId)!.push({ id: sourceId, operation: 'removeParent' as const });
			}

			// Convert to update params
			const updates = Array.from(relationChanges.entries()).map(([taskId, relations]) => ({
				id: taskId,
				data: {},
				relations
			}));

			await tasksAPI.updateTasks({ updates });
		}
	}

	//#endregion
</script>

<div class="graph-root page page-root">
	<AppHeader />
	<SvelteFlowProvider>
		<SvelteFlow
			bind:nodes
			bind:edges
			fitView
			nodeTypes={{ task: TaskNode }}
			nodeOrigin={[0.5, 0.5]}
			edgeTypes={{ task: TaskEdge }}
			defaultEdgeOptions={{ type: 'task' }}
			oninit={initializeFlow}
			ondelete={handleDelete}
			onconnectstart={handleConnectStart}
			onreconnectstart={handleReconnectStart}
			onconnect={handleConnect}
			onbeforereconnect={handleBeforeReconnect}
			onreconnect={handleReconnect}
			onconnectend={handleConnectEnd}
			onreconnectend={handleReconnectEnd}
			{isValidConnection}
		>
			<Background />
		</SvelteFlow>
		<Button
			variant="outline"
			class="fixed right-7 bottom-24 rounded-full border-2"
			onclick={() => {
				triggerTaskForNew = null;
				drawerOpen = true;
			}}
		>
			+
		</Button>
	</SvelteFlowProvider>
	<AppFooter />
</div>

<TaskCreationDrawer bind:open={drawerOpen} relation={triggerTaskForNew} />

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
