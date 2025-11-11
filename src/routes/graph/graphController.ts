import type { Task } from '$domain/models/task';
import { Err } from '$domain/errors';
import type { Node, Edge, OnConnectEnd, OnReconnectEnd, Connection, SvelteFlowInstance } from '@xyflow/svelte';
import { authState } from '$lib/API/Auth';
import tasksAPI from '$lib/API/Tasks';
import { tutorials } from '$lib/tutorials/store';
import { goto } from '$app/navigation';
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
import { writable, get, type Readable } from 'svelte/store';

export type DrawerTrigger = { task: Task; mode: 'parent' | 'child' } | null;

export interface GraphControllerState {
	// Reactive state references owned by the Svelte component
	taskById: Map<string, Task>;
	getNodes: () => Node[];
	setNodes: (nodes: Node[]) => void;
	getEdges: () => Edge[];
	setEdges: (edges: Edge[]) => void;
	setDrawerOpen: (open: boolean) => void;
	setTriggerTaskForNew: (trigger: DrawerTrigger) => void;
	getScreenToFlowPosition: () => ((point: { x: number; y: number }) => { x: number; y: number }) | null;
	setScreenToFlowPosition: (
		fn: ((point: { x: number; y: number }) => { x: number; y: number }) | null
	) => void;
	getSvelteFlowInstance: () => SvelteFlowInstance | null;
	setSvelteFlowInstance: (instance: SvelteFlowInstance) => void;
	connectionState: {
		successful: boolean;
		sourceNodeId: string | null;
		handleType: string | null;
		dropPosition: { x: number; y: number } | null;
	};
	reconnectionState: {
		successful: boolean;
		detachEnd: 'source' | 'target' | null;
		oldEdge: Edge | null;
		inProgress: boolean;
	};
}

export interface GraphController {
	init: () => void;
	destroy: () => void;
	updateTasks: (tasks: Task[]) => Promise<void>;
	setVisibleTaskIds: (
		matchingIds: Set<string> | null,
		options?: { includeRelated?: boolean; relatedDepth?: number }
	) => void;
	setScreenToFlowPosition: (
		fn: ((point: { x: number; y: number }) => { x: number; y: number }) | null
	) => void;
	setSvelteFlowInstance: (instance: SvelteFlowInstance) => void;
	centerNode: (taskId: string) => void;
	nodes: Readable<Node[]>;
	edges: Readable<Edge[]>;
	drawerOpen: Readable<boolean>;
	triggerTaskForNew: Readable<DrawerTrigger>;
	replaceNodesFromView: (nodes: Node[]) => void;
	replaceEdgesFromView: (edges: Edge[]) => void;
	setDrawerOpen: (open: boolean) => void;
	setTriggerTaskForNew: (trigger: DrawerTrigger) => void;
	handlers: {
		isValidConnection: (connection: { source?: string; target?: string }) => boolean;
		handleConnectStart: (
			event: MouseEvent | TouchEvent,
			params: { nodeId: string | null; handleId: string | null; handleType: any }
		) => void;
		handleReconnectStart: (
			event: MouseEvent | TouchEvent,
			edge: Edge,
			handleType: 'source' | 'target'
		) => void;
		handleConnect: (connection: Connection) => Promise<void>;
		handleBeforeReconnect: (reconnectedEdge: Edge, oldEdge: Edge) => Edge | false;
		handleReconnect: (
			oldEdge: Edge,
			newConnection: { source?: string; target?: string }
		) => Promise<void>;
		handleConnectEnd: OnConnectEnd;
		handleReconnectEnd: OnReconnectEnd;
		handleDelete: (params: { nodes: Node[]; edges: Edge[] }) => Promise<void>;
	};
}

/**
 * Computes all ancestors and descendants of a task by walking the graph.
 * Returns sets of matching task IDs and related (dimmed) task IDs.
 * @param relatedDepth - Number of levels to traverse: 1 = direct only, -1 = all levels
 */
function computeRelatedTasks(
	matchingIds: Set<string>,
	taskById: Map<string, Task>,
	includeRelated: boolean,
	relatedDepth: number
): { matching: Set<string>; related: Set<string> } {
	if (!includeRelated) {
		return { matching: matchingIds, related: new Set() };
	}

	const related = new Set<string>();
	const visited = new Set<string>();

	const walkAncestors = (taskId: string, depth: number) => {
		if (visited.has(taskId)) return;
		visited.add(taskId);

		const task = taskById.get(taskId);
		if (!task) return;

		for (const parentId of task.parents) {
			if (!matchingIds.has(parentId)) {
				related.add(parentId);
			}
			// Continue if depth is unlimited (-1) or we haven't reached the limit
			if (relatedDepth === -1 || depth < relatedDepth) {
				walkAncestors(parentId, depth + 1);
			}
		}
	};

	const walkDescendants = (taskId: string, depth: number) => {
		if (visited.has(taskId)) return;
		visited.add(taskId);

		const task = taskById.get(taskId);
		if (!task) return;

		for (const childId of task.children) {
			if (!matchingIds.has(childId)) {
				related.add(childId);
			}
			// Continue if depth is unlimited (-1) or we haven't reached the limit
			if (relatedDepth === -1 || depth < relatedDepth) {
				walkDescendants(childId, depth + 1);
			}
		}
	};

	// Walk from each matching task
	for (const taskId of matchingIds) {
		visited.clear();
		walkAncestors(taskId, 1);
		visited.clear();
		walkDescendants(taskId, 1);
	}

	return { matching: matchingIds, related };
}

export function createGraphController(): GraphController {
	let unsubscribeAuth: (() => void) | null = null;

	// Controller-owned state and stores
	const taskById = new Map<string, Task>();
	let screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | null = null;
	let svelteFlowInstance: SvelteFlowInstance | null = null;

	// Visibility filter state
	let visibilityFilter: {
		matching: Set<string>;
		related: Set<string>;
	} | null = null;

	const nodesStore = writable<Node[]>([]);
	const edgesStore = writable<Edge[]>([]);
	const drawerOpenStore = writable<boolean>(false);
	const triggerStore = writable<DrawerTrigger>(null);

	const connectionState = {
		successful: false,
		sourceNodeId: null as string | null,
		handleType: null as string | null,
		dropPosition: null as { x: number; y: number } | null
	};
	const reconnectionState = {
		successful: false,
		detachEnd: null as 'source' | 'target' | null,
		oldEdge: null as Edge | null,
		inProgress: false
	};

	const setNodes = (nodes: Node[]) => {
		if (get(nodesStore) !== nodes) nodesStore.set(nodes);
	};
	const setEdges = (edges: Edge[]) => {
		if (get(edgesStore) !== edges) edgesStore.set(edges);
	};
	const getNodes = () => get(nodesStore);
	const getEdges = () => get(edgesStore);
	const setDrawerOpen = (open: boolean) => {
		drawerOpenStore.set(open);
	};
	const setTriggerTaskForNew = (trigger: DrawerTrigger) => {
		if (get(triggerStore) !== trigger) triggerStore.set(trigger);
	};

	const state: GraphControllerState = {
		taskById,
		getNodes,
		setNodes,
		getEdges,
		setEdges,
		setDrawerOpen,
		setTriggerTaskForNew,
		getScreenToFlowPosition: () => screenToFlowPosition,
		setScreenToFlowPosition: (fn) => {
			screenToFlowPosition = fn;
		},
		getSvelteFlowInstance: () => svelteFlowInstance,
		setSvelteFlowInstance: (instance) => {
			svelteFlowInstance = instance;
		},
		connectionState,
		reconnectionState
	};

	function resetTaskMap(tasks: Task[]) {
		// Mutate provided Map instance to preserve Svelte reactivity
		state.taskById.clear();
		for (const t of tasks) state.taskById.set(t.id, t);
	}

	async function rebuildLayoutFromMap() {
		const allTasks = Array.from(state.taskById.values());
		const graph = await layoutTasksWithElk(allTasks, { direction: 'RIGHT' });

		// Apply visibility filtering
		if (visibilityFilter) {
			const visibleIds = new Set([...visibilityFilter.matching, ...visibilityFilter.related]);

			// Mark nodes as hidden or dimmed
			const filteredNodes = graph.nodes.map((node) => {
				const isVisible = visibleIds.has(node.id);
				const isDimmed = visibilityFilter!.related.has(node.id);

				return {
					...node,
					hidden: !isVisible,
					data: {
						...node.data,
						dimmed: isDimmed
					}
				};
			});

			// Hide edges where either endpoint is hidden; mark as dimmed if either endpoint is dimmed
			const filteredEdges = graph.edges.map((edge) => {
				const sourceHidden = !visibleIds.has(edge.source);
				const targetHidden = !visibleIds.has(edge.target);
				const sourceDimmed = visibilityFilter!.related.has(edge.source);
				const targetDimmed = visibilityFilter!.related.has(edge.target);

				return {
					...edge,
					hidden: sourceHidden || targetHidden,
					data: {
						...edge.data,
						dimmed: sourceDimmed || targetDimmed
					}
				};
			});

			state.setNodes(filteredNodes);
			state.setEdges(filteredEdges);
		} else {
			// No filter: show all nodes normally, explicitly clear hidden/dimmed
			const clearedNodes = graph.nodes.map((node) => ({
				...node,
				hidden: false,
				data: {
					...node.data,
					dimmed: false
				}
			}));

			const clearedEdges = graph.edges.map((edge) => ({
				...edge,
				hidden: false,
				data: {
					...edge.data,
					dimmed: false
				}
			}));

			state.setNodes(clearedNodes);
			state.setEdges(clearedEdges);
		}
	}

	// Deltas removed; full rebuild from store emissions

	async function updateTasks(tasks: Task[]) {
		resetTaskMap(tasks);
		await rebuildLayoutFromMap();
	}

	let visibilityUpdateTimer: ReturnType<typeof setTimeout> | null = null;

	function setVisibleTaskIds(
		matchingIds: Set<string> | null,
		options?: { includeRelated?: boolean; relatedDepth?: number }
	) {
		const includeRelated = options?.includeRelated ?? false;
		const relatedDepth = options?.relatedDepth ?? -1;

		// Check if we're clearing the filter
		const isClearing = !matchingIds || matchingIds.size === 0;

		if (!matchingIds) {
			// Clear filter: show all nodes
			visibilityFilter = null;
		} else {
			// Compute related tasks if requested
			const result = computeRelatedTasks(matchingIds, state.taskById, includeRelated, relatedDepth);
			visibilityFilter = result;
		}

		// Clear any pending timer
		if (visibilityUpdateTimer) {
			clearTimeout(visibilityUpdateTimer);
			visibilityUpdateTimer = null;
		}

		// Immediate update when clearing filter (better UX), debounced otherwise
		if (isClearing) {
			rebuildLayoutFromMap();
		} else {
			visibilityUpdateTimer = setTimeout(() => {
				rebuildLayoutFromMap();
				visibilityUpdateTimer = null;
			}, 150);
		}
	}

	function initAuthSubscription() {
		unsubscribeAuth = authState.subscribe((auth) => {
			if (auth.status !== 'signed-in') {
				(state.taskById as Map<string, Task>).clear();
				state.setNodes([]);
				state.setEdges([]);
			}
		});
	}

	function initTutorialRedirect() {
		if (!tutorials.isDone('home.welcome')) {
			goto('/planner');
		}
	}

	function isValidConnection(connection: { source?: string; target?: string }) {
		const parentId = connection?.source ?? '';
		const childId = connection?.target ?? '';
		if (!parentId || !childId) return false;
		if (parentId === childId) return false;

		if (!state.reconnectionState.inProgress) {
			const sourceTask = state.taskById.get(parentId);
			if (sourceTask?.children.includes(childId)) return false;

			const childTask = state.taskById.get(childId);
			if (childTask?.parents.includes(parentId)) return false;
		}
		return !wouldCreateCycle(parentId, childId, state.getEdges());
	}

	function handleConnectStart(
		_event: MouseEvent | TouchEvent,
		params: { nodeId: string | null; handleId: string | null; handleType: any }
	) {
		if (state.reconnectionState.inProgress) return;
		state.connectionState.sourceNodeId = params?.nodeId ?? null;
		state.connectionState.handleType = params?.handleType ?? null;
		state.connectionState.successful = false;
	}

	function handleReconnectStart(
		_event: MouseEvent | TouchEvent,
		edge: Edge,
		handleType: 'source' | 'target'
	) {
		state.reconnectionState.successful = false;
		state.reconnectionState.detachEnd = handleType;
		state.reconnectionState.oldEdge = edge;
		state.reconnectionState.inProgress = true;
	}

	async function handleConnect(connection: Connection) {
		state.connectionState.successful = true;
		try {
			const parentId: string | undefined = connection?.source;
			const childId: string | undefined = connection?.target;
			if (!parentId || !childId || parentId === childId) return;

			await updateTaskRelationship(tasksAPI, state.taskById, parentId, childId, 'add');
			state.setNodes(
				refreshSpecificNodes(state.getNodes(), state.taskById, [parentId, childId])
			);
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to create connection');
		}
	}

	function handleBeforeReconnect(reconnectedEdge: Edge, oldEdge: Edge): Edge | false {
		const newSource = String(reconnectedEdge.source ?? oldEdge.source ?? '');
		const newTarget = String(reconnectedEdge.target ?? oldEdge.target ?? '');
		if (!newSource || !newTarget) return false;
		if (newSource === newTarget) return false;
		return { ...reconnectedEdge, type: (oldEdge as any).type ?? 'task' } as Edge;
	}

	async function handleReconnect(
		oldEdge: Edge,
		newConnection: { source?: string; target?: string }
	) {
		state.reconnectionState.successful = true;
		try {
			const oldSource = String(oldEdge.source);
			const oldTarget = String(oldEdge.target);
			const newSource = String(newConnection?.source ?? oldSource);
			const newTarget = String(newConnection?.target ?? oldTarget);

			if (!newSource || !newTarget) return;
			if (newSource === oldSource && newTarget === oldTarget) return;

			await updateTaskRelationship(tasksAPI, state.taskById, oldSource, oldTarget, 'remove');

			if (!connectionExists(state.getEdges(), newSource, newTarget)) {
				await updateTaskRelationship(tasksAPI, state.taskById, newSource, newTarget, 'add');
			} else {
				state.setEdges(removeDuplicateEdges(state.getEdges()));
			}

			state.setNodes(refreshNodeData(state.getNodes(), state.taskById));
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to handle reconnect');
		}
	}

	const handleConnectEnd: OnConnectEnd = (event, connectState) => {
		if (state.reconnectionState.inProgress) {
			state.connectionState.sourceNodeId = null;
			state.connectionState.handleType = null;
			state.connectionState.successful = false;
			return;
		}

		if (!state.connectionState.successful && state.connectionState.sourceNodeId) {
			if (connectState.toHandle || connectState.toNode) {
				// no-op; invalid connection dropped on a handle
			} else {
				const dropPos = getFlowPointFromEvent(event as any, state.getScreenToFlowPosition()) || null;
				state.connectionState.dropPosition = dropPos;

				const triggerTask = state.taskById.get(state.connectionState.sourceNodeId) || null;
				if (triggerTask) {
					state.setTriggerTaskForNew({
						task: triggerTask,
						mode: state.connectionState.handleType === 'source' ? 'parent' : 'child'
					});
					state.setDrawerOpen(true);
				}
			}
		}
		state.connectionState.sourceNodeId = null;
		state.connectionState.handleType = null;
		state.connectionState.successful = false;
	};

	const handleReconnectEnd: OnReconnectEnd = async (event, edge, _handleType, connectState) => {
		try {
			if (!state.reconnectionState.successful) {
				const droppedOnHandle =
					(event as Event)?.target && (event.target as Element).closest?.('.svelte-flow__handle');
				const hasTarget = Boolean(connectState?.toNode || connectState?.toHandle);

				if (!droppedOnHandle && !hasTarget) {
					const src = String(edge.source);
					const tgt = String(edge.target);
					await updateTaskRelationship(tasksAPI, state.taskById, src, tgt, 'remove');

					state.setEdges(state.getEdges().filter((e) => e.id !== edge.id));
					state.setNodes(refreshNodeData(state.getNodes(), state.taskById));
				}
			}
		} catch (e) {
			Err.UNHANDLED(e, 'Failed to finalize reconnect');
		} finally {
			state.reconnectionState.successful = false;
			state.reconnectionState.detachEnd = null;
			state.reconnectionState.oldEdge = null;
			state.reconnectionState.inProgress = false;
		}
	};

	async function handleDelete(params: { nodes: Node[]; edges: Edge[] }): Promise<void> {
		if (params.nodes.length > 0) {
			await tasksAPI.deleteTasks({ ids: params.nodes.map((n) => n.id) });
		}
		// TODO This should be handled by the server
		/* 		if (params.edges.length > 0) {
					const relationChanges = new Map<
						string,
						{ id: string; operation: 'removeChild' | 'removeParent' | 'addChild' | 'addParent' }[]
					>();
		
					for (const edge of params.edges) {
						const sourceId = edge.source;
						const targetId = edge.target;
		
						if (!relationChanges.has(sourceId)) {
							relationChanges.set(sourceId, []);
						}
						relationChanges.get(sourceId)!.push({ id: targetId, operation: 'removeChild' as const });
		
						if (!relationChanges.has(targetId)) {
							relationChanges.set(targetId, []);
						}
						relationChanges.get(targetId)!.push({ id: sourceId, operation: 'removeParent' as const });
					}
		
					const updates = Array.from(relationChanges.entries()).map(([taskId, relations]) => ({
						id: taskId,
						data: {},
						relations
					}));
		
					await tasksAPI.updateTasks({ updates });
				} */
	}

	function centerNode(taskId: string, options: { select?: boolean } = { select: true }) {
		const node = state.getNodes().find((n) => n.id === taskId);
		if (!node) return;

		const instance = state.getSvelteFlowInstance();
		if (!instance?.setCenter) return;

		// Pan to node center with animation
		instance.setCenter(node.position.x, node.position.y, { duration: 250, zoom: 1.5 });

		// Dispatch highlight event to node DOM element
		// Use setTimeout to ensure DOM is ready after potential layout updates
		// setTimeout(() => {
		const nodeElement = document.querySelector(`[data-tasknodeid="${taskId}"]`) as HTMLElement;
		if (nodeElement) {
			nodeElement.dispatchEvent(new CustomEvent('highlight', { bubbles: false }));
		}
		// }, 0);

		// Note: selection handled by caller (page component) to avoid circular deps
	}

	return {
		init: () => {
			initTutorialRedirect();
			initAuthSubscription();
		},
		destroy: () => {
			unsubscribeAuth?.();
			if (visibilityUpdateTimer) {
				clearTimeout(visibilityUpdateTimer);
				visibilityUpdateTimer = null;
			}
		},
		updateTasks,
		setVisibleTaskIds,
		setScreenToFlowPosition: (fn) => state.setScreenToFlowPosition(fn),
		setSvelteFlowInstance: (instance) => state.setSvelteFlowInstance(instance),
		centerNode,
		nodes: nodesStore,
		edges: edgesStore,
		drawerOpen: drawerOpenStore,
		triggerTaskForNew: triggerStore,
		replaceNodesFromView: (n) => setNodes(n),
		replaceEdgesFromView: (e) => setEdges(e),
		setDrawerOpen,
		setTriggerTaskForNew,
		handlers: {
			isValidConnection,
			handleConnectStart,
			handleReconnectStart,
			handleConnect,
			handleBeforeReconnect,
			handleReconnect,
			handleConnectEnd,
			handleReconnectEnd,
			handleDelete
		}
	};
}
