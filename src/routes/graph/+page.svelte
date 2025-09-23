<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Background,
		Position,
		type Node,
		type Edge,
		useSvelteFlow
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { type Task } from '$lib/API/Tasks/Task';
	import { authState } from '@/API/Auth/BrowserAuthProvider';
	import { taskAPIPromise } from '@/API/providerRegistry';
	import type { TaskDelta } from '$lib/API/Tasks/types';
	import AppHeader from '@/components/AppHeader.svelte';
	import AppFooter from '@/components/AppFooter.svelte';
	import TaskCreationDrawer from '../tasks/TaskCreationDrawer.svelte';
	import type { ILocalTasks } from '$lib/API/Tasks/types';
	import type { User } from '$lib/API/Auth/User';
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
	import { tutorials } from '@/tutorials/store';
	import { goto } from '$app/navigation';

	let taskById = new SvelteMap<string, Task>();
	let tasksAPI: ILocalTasks | null = $state(null);
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
			goto('/home');
			return;
		}
		tasksAPI = await taskAPIPromise;
		// Subscribe to auth state
		unsubscribeAuth = authState.subscribe((state) => {
			if (state.status === 'signed-in') {
				setupSubscription();
			}
		});
		setupSubscription();
	});
	onDestroy(() => {
		unsubscribeTasks?.();
		unsubscribeAuth?.();
	});

	function setupSubscription() {
		if (!tasksAPI || $authState.status !== 'signed-in') return;
		unsubscribeTasks?.();
		unsubscribeTasks = tasksAPI.subscribeTasks({
			userId: $authState.user.id,
			onInitialize: async (tasks) => {
				taskById = new SvelteMap(tasks.map((t) => [t.id, t]));
				await rebuildLayoutFromMap();
			},
			onChange: async (changes) => {
				applyDeltas(changes);
			}
		});
	}

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
			console.log('handleConnectStart (suppressed)');
			return;
		}
		console.log('handleConnectStart');
		connectionState.sourceNodeId = params?.nodeId ?? null;
		connectionState.handleType = params?.handleType ?? null;
		connectionState.successful = false;
	}
	function handleReconnectStart(
		event: MouseEvent | TouchEvent,
		edge: Edge,
		handleType: 'source' | 'target'
	) {
		console.log('handleReconnectStart');
		reconnectionState.successful = false;
		reconnectionState.detachEnd = handleType;
		reconnectionState.oldEdge = edge;
		reconnectionState.inProgress = true;
	}

	async function handleConnect(connection: any) {
		console.log('handleConnect');
		connectionState.successful = true;
		try {
			if (!tasksAPI) return;
			const parentId: string | undefined = connection?.source;
			const childId: string | undefined = connection?.target;
			if (!parentId || !childId || parentId === childId) return;

			// Cycles prevented by isValidConnection
			await updateTaskRelationship(tasksAPI, taskById, parentId, childId, 'add');
			// Refresh affected nodes
			nodes = refreshSpecificNodes(nodes, taskById, [parentId, childId]);
		} catch (e) {
			console.error('Failed to create connection', e);
		}
	}
	function handleBeforeReconnect(reconnectedEdge: Edge, oldEdge: Edge): Edge | false {
		console.log('handleBeforeReconnect');
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
		console.log('handleReconnect');
		reconnectionState.successful = true;
		try {
			if (!tasksAPI) return;
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
			console.error('Failed to handle reconnect', e);
		}
	}

	function handleConnectEnd(event: MouseEvent | TouchEvent, connectState: any) {
		if (reconnectionState.inProgress) {
			console.log('handleConnectEnd (suppressed)');
			connectionState.sourceNodeId = null;
			connectionState.handleType = null;
			connectionState.successful = false;
			return;
		}
		console.log('handleConnectEnd');
		const droppedOnHandle = (event as any)?.target?.closest?.('.svelte-flow__handle');

		if (!connectionState.successful && connectionState.sourceNodeId) {
			// If user dropped onto a handle but the connection was invalid, do NOT open create drawer
			if (droppedOnHandle) {
				// no-op; just cancel
			} else {
				// Open task creation drawer
				const dropPos =
					getFlowPointFromEvent(event, screenToFlowPosition) || connectState?.to || null;
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
	}
	async function handleReconnectEnd(
		event: MouseEvent | TouchEvent,
		edge: Edge,
		_handleType?: 'source' | 'target',
		connectState?: any
	) {
		console.log('handleReconnectEnd');
		try {
			if (!tasksAPI) return;
			// If not successful, only delete when truly dropped on the pane (no target handle)
			if (!reconnectionState.successful) {
				const droppedOnHandle = (event as any)?.target?.closest?.('.svelte-flow__handle');
				const hasTarget = Boolean(connectState?.to?.nodeId || connectState?.to?.handleId);

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
			console.error('Failed to finalize reconnect', e);
		} finally {
			// Reset reconnection state
			reconnectionState.successful = false;
			reconnectionState.detachEnd = null;
			reconnectionState.oldEdge = null;
			reconnectionState.inProgress = false;
		}
	}

	//#endregion

	async function handleDelete(params: { nodes: Node[]; edges: Edge[] }): Promise<void> {
		console.log('handleDelete');

		if (!tasksAPI) return;

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

	function handleTaskCreated(newTask: Task) {
		// Update local maps and render without re-layout
		taskById.set(newTask.id, newTask);
		const dropPoint = connectionState.dropPosition;

		if (dropPoint) {
			nodes = [
				...nodes,
				{
					id: newTask.id,
					type: 'task',
					data: newTask as unknown as Record<string, unknown>,
					position: { x: dropPoint.x, y: dropPoint.y },
					sourcePosition: Position.Bottom,
					targetPosition: Position.Top
				}
			];

			if (triggerTaskForNew) {
				const { task, mode } = triggerTaskForNew;
				const newEdge = {
					id: mode === 'parent' ? `e-${task.id}-${newTask.id}` : `e-${newTask.id}-${task.id}`,
					source: mode === 'parent' ? task.id : newTask.id,
					target: mode === 'parent' ? newTask.id : task.id,
					type: 'task'
				};
				edges = [...edges, newEdge];
			}
		}

		// Reset connection state
		connectionState.dropPosition = null;
		drawerOpen = false;
	}
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
	</SvelteFlowProvider>
	<AppFooter />
</div>

{#if tasksAPI && $authState.status === 'signed-in'}
	<TaskCreationDrawer
		open={drawerOpen}
		onOpenChange={(o) => (drawerOpen = o)}
		onTaskCreated={handleTaskCreated}
		tasks={tasksAPI}
		user={$authState.user}
		relation={triggerTaskForNew}
	/>
{/if}

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
