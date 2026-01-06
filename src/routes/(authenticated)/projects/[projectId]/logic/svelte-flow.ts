import { useSvelteFlow, type EdgeEvents, type IsValidConnection, type NodeEvents, type NodeSelectionEvents, type OnBeforeConnect, type OnBeforeDelete, type OnBeforeReconnect, type OnConnect, type OnConnectEnd, type OnConnectStart, type OnDelete, type OnError, type OnMove, type OnMoveEnd, type OnMoveStart, type OnReconnect, type OnReconnectEnd, type OnReconnectStart, type OnSelectionChange, type PaneEvents } from '@xyflow/svelte';
import { get, writable, type Writable } from 'svelte/store';
import tasksAPI from '$lib/API/Tasks';
import { viewNodes, viewEdges, appData, getEdgeKey, svelteFlowInstance } from './shared-state';
import { drawerOpen, drawerParams, pendingNodeParams, selectedNode } from './ui-state';
import type { Task, UpdateTaskParams } from '$domain/models/task';
import type { ViewEdge, ViewNode } from './layout/LayoutEngine';
import { layoutEngine } from './layout';
import { setEquals } from '$lib/utils';


//#region SvelteFlow Event Handlers

function oninit() {
	const instance = useSvelteFlow();
	svelteFlowInstance.set(instance);
};

const onpaneclick: PaneEvents['onpaneclick'] = () => {
	selectedNode.set(null);
};

const ondelete: OnDelete<ViewNode, ViewEdge> = async (params) => {
	if (params.nodes.length === 1) {
		const task = params.nodes[0].data.appNode;
		const parent = appData.get(task.parents[0]);
		selectedNode.set(parent ?? null);
	} else {
		selectedNode.set(null);
	}
	// Track which nodes are being deleted
	const deletedNodeIds = new Set(params.nodes.map((n) => n.id));

	// If node deleted
	if (params.nodes.length > 0) {
		const ids = params.nodes.map((n) => n.id);
		const [, error] = await tasksAPI.deleteTasks({ ids });
		error?.UNHANDLED();
	}

	const filteredEdges = params.edges.filter((e) => !params.nodes.some((n) => n.id === e.source || n.id === e.target));

	// If edge deleted
	if (filteredEdges.length > 0) {
		const childrenToRemove = new Map<string, string[]>();
		const parentsToRemove = new Map<string, string[]>();

		for (const edge of params.edges) {
			const sourceId = edge.source;
			const targetId = edge.target;

			// Skip updates for nodes that are being deleted
			if (!deletedNodeIds.has(sourceId)) {
				if (!childrenToRemove.has(sourceId)) childrenToRemove.set(sourceId, []);
				childrenToRemove.get(sourceId)!.push(targetId);
			}

			if (!deletedNodeIds.has(targetId)) {
				if (!parentsToRemove.has(targetId)) parentsToRemove.set(targetId, []);
				parentsToRemove.get(targetId)!.push(sourceId);
			}
		}

		const updates: UpdateTaskParams[] = [];

		for (const [taskId, childIds] of childrenToRemove.entries()) {
			// Double-check node still exists before updating
			if (!deletedNodeIds.has(taskId) && appData.has(taskId)) {
				updates.push({
					id: taskId,
					removeChildren: childIds,
				});
			}
		}

		for (const [taskId, parentIds] of parentsToRemove.entries()) {
			// Double-check node still exists before updating
			if (!deletedNodeIds.has(taskId) && appData.has(taskId)) {
				updates.push({
					id: taskId,
					removeParents: parentIds,
				});
			}
		}

		if (updates.length > 0) {
			const [, error] = await tasksAPI.updateTasks({ updates })
			error?.UNHANDLED();
		}
	}
};

//#region Node Handlers

let lastSelectedNodes = new Set<string>();
let lastSelectedEdges = new Set<string>();

const onselectionchange: OnSelectionChange<ViewNode, ViewEdge> = ({ nodes, edges }) => {
	const nextNodes = new Set(nodes.map(n => n.id));
	const nextEdges = new Set(edges.map(e => e.id));

	if (setEquals(nextNodes, lastSelectedNodes) && setEquals(nextEdges, lastSelectedEdges)) {
		return; // no-op → prevents loop
	}
	lastSelectedNodes = nextNodes;
	lastSelectedEdges = nextEdges;

	// Optional: if you mirror selected into viewNodes, do it surgically and idempotently
	for (const [id, vn] of viewNodes) {
		const sel = nextNodes.has(id);
		if (vn.selected !== sel) {
			viewNodes.set(id, { ...vn, selected: sel });
		}
	}
};

const onnodeclick: NodeEvents<ViewNode>['onnodeclick'] = ({ node, event }) => {
	if (event?.shiftKey || event?.metaKey || event?.ctrlKey) return;
	selectedNode.set(node.data.appNode
		? (viewNodes.get(node.id)?.data.appNode ?? null)
		: null);
};

const onnodedragstart: NodeEvents<ViewNode>['onnodedragstart'] = ({ targetNode }) => {
	if (!targetNode) return;
	layoutEngine.onNodeDragged(targetNode.id, targetNode.position);
};

const onnodedrag: NodeEvents<ViewNode>['onnodedrag'] = ({ targetNode }) => {
	if (!targetNode) return;
	layoutEngine.onNodeDragged(targetNode.id, targetNode.position);
};

const onnodedragstop: NodeEvents<ViewNode>['onnodedragstop'] = ({ targetNode }) => {
	if (!targetNode) return;
	layoutEngine.onNodeDragEnd(targetNode.id, targetNode.position);
};

//#endregion


//#region Edge Connection Handlers

let connectionSuccessful = false;
let connectionSourceNodeId: string | null = null;
let connectionHandleType: string | null = null;

let reconnectionSuccessful = false;
let reconnectionInProgress = false;

const onconnectstart: OnConnectStart = (_event, params) => {
	if (reconnectionInProgress) return;
	connectionSourceNodeId = params?.nodeId ?? null;
	connectionHandleType = params?.handleType ?? null;
	connectionSuccessful = false;
};

const onconnect: OnConnect = async (connection) => {
	connectionSuccessful = true;
	const parentId: string | undefined = connection?.source;
	const childId: string | undefined = connection?.target;
	if (!parentId || !childId || parentId === childId) return;

	const [, error] = await tasksAPI.updateTask({
		id: parentId,
		addChildren: [childId],
	})
	error?.UNHANDLED();

	// refreshNodesDataFor([parentId, childId]);
};

const onconnectend: OnConnectEnd = (event, connectState) => {
	if (reconnectionInProgress) {
		connectionSourceNodeId = null;
		connectionHandleType = null;
		connectionSuccessful = false;
		return;
	}

	if (!connectionSuccessful && connectionSourceNodeId) {
		if (connectState.toHandle || connectState.toNode) {
			// dropped on a handle, invalid connection — no-op
		} else {

			const srcId = connectionSourceNodeId;
			const triggerTask = srcId ? appData.get(srcId) || null : null;
			if (triggerTask && triggerTask.data.type === 'task') {
				drawerParams.set({
					relation: triggerTask as Task,
					mode: connectionHandleType === 'source' ? 'parent' : 'child',
				});

				const pos = getFlowPointFromEvent(event, get(svelteFlowInstance)!.screenToFlowPosition) || null;
				if (pos) {
					// we know relation and mode before API call
					pendingNodeParams.set({
						pos,
						// TODO ts: Date.now(),
					});
				}

				drawerOpen.set(true);
			}
		}
	}

	connectionSourceNodeId = null;
	connectionHandleType = null;
	connectionSuccessful = false;
};

const onreconnectstart: OnReconnectStart<ViewEdge> = () => {
	reconnectionSuccessful = false;
	reconnectionInProgress = true;
};

const onbeforereconnect: OnBeforeReconnect<ViewEdge> = (reconnectedEdge, oldEdge) => {
	const newSource = String(reconnectedEdge.source ?? oldEdge.source ?? '');
	const newTarget = String(reconnectedEdge.target ?? oldEdge.target ?? '');
	if (!newSource || !newTarget) return false;
	if (newSource === newTarget) return false;
	return reconnectedEdge;
};

const onreconnect: OnReconnect<ViewEdge> = async (oldEdge, newConnection) => {
	reconnectionSuccessful = true;
	const oldSource = String(oldEdge.source);
	const oldTarget = String(oldEdge.target);
	const newSource = String(newConnection?.source ?? oldSource);
	const newTarget = String(newConnection?.target ?? oldTarget);

	if (!newSource || !newTarget) return;
	if (newSource === oldSource && newTarget === oldTarget) return;

	const [, error] = await tasksAPI.updateTask({
		id: oldSource,
		removeChildren: [oldTarget],
	})
	error?.UNHANDLED();

	if (!viewEdges.has(getEdgeKey(newSource, newTarget))) {
		const [, error] = await tasksAPI.updateTask({
			id: newSource,
			addChildren: [newTarget],
		})
		error?.UNHANDLED();
	}

	// refreshNodesDataFor([oldSource, oldTarget, newSource, newTarget]);
};

const onreconnectend: OnReconnectEnd<ViewEdge> = async (
	event,
	edge,
	_handleType,
	connectState,
) => {
	if (!reconnectionSuccessful) {
		const droppedOnHandle =
			(event as Event)?.target && (event.target as Element).closest?.('.svelte-flow__handle');
		const hasTarget = Boolean(connectState?.toNode || connectState?.toHandle);

		if (!droppedOnHandle && !hasTarget) {
			const src = String(edge.source);
			const tgt = String(edge.target);

			const [, error] = await tasksAPI.updateTask({
				id: src,
				removeChildren: [tgt],
			})
			error?.UNHANDLED();

			viewEdges.delete(getEdgeKey(src, tgt));
			// refreshNodesDataFor([src, tgt]);
		}
	}

	reconnectionSuccessful = false;
	reconnectionInProgress = false;
};

//#endregion

//#endregion


//#region SvelteFlow Domain Adapter

type NodeId = string;
type EdgeId = string;

export class SvelteFlowAdapter {
	public readonly nodes: Writable<ViewNode[]> = writable([]);
	public readonly edges: Writable<ViewEdge[]> = writable([]);

	private nodeIndex = new Map<NodeId, number>();
	private edgeIndex = new Map<EdgeId, number>();
	private unsubViewNodes: (() => void) | null = null;
	private unsubViewEdges: (() => void) | null = null;

	// call once at mount
	constructor() {
		// Initialize from existing state (handles navigation back to page)
		const currentNodes = Array.from(viewNodes.values());
		this.nodes.set(currentNodes);
		currentNodes.forEach((node, idx) => this.nodeIndex.set(node.id, idx));

		const currentEdges = Array.from(viewEdges.values());
		this.edges.set(currentEdges);
		currentEdges.forEach((edge, idx) => this.edgeIndex.set(edge.id, idx));

		// Subscribe to viewNodes - mirror changes to SvelteFlow nodes array
		this.unsubViewNodes = viewNodes.subscribe(({ key, value, op }) => {
			if (op === 'add') {
				this.nodes.update(arr => {
					this.nodeIndex.set(key, arr.length);
					arr.push(value!);
					return arr;
				});
			} else if (op === 'set') {
				const idx = this.nodeIndex.get(key);
				if (idx === undefined) return;

				// Create new array to trigger Svelte reactivity
				this.nodes.update(arr => {
					arr[idx] = value!;
					return [...arr];
				});
			} else if (op === 'delete') {
				// delete node
				const idx = this.nodeIndex.get(key);
				if (idx == null) return;
				this.nodes.update(arr => {
					this.nodeIndex.delete(key);
					// fix indices after idx
					for (let i = idx; i < arr.length - 1; i++) {
						this.nodeIndex.set(arr[i + 1].id, i);
					}
					return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
				});
			}
		});

		// Subscribe to viewEdges - mirror changes to SvelteFlow edges array
		this.unsubViewEdges = viewEdges.subscribe(({ key, value, op }) => {
			if (op === 'add') {
				// add edge
				this.edges.update(arr => {
					this.edgeIndex.set(key, arr.length);
					return [...arr, value!];
				});
			} else if (op === 'set') {
				// update edge
				const idx = this.edgeIndex.get(key);
				if (idx == null) {
					// Edge doesn't exist yet, add it
					this.edges.update(arr => {
						this.edgeIndex.set(key, arr.length);
						return [...arr, value!];
					});
				} else {
					this.edges.update(arr => [...arr.slice(0, idx), value!, ...arr.slice(idx + 1)]);
				}
			} else if (op === 'delete') {
				// delete edge
				const idx = this.edgeIndex.get(key);
				if (idx == null) return;
				this.edges.update(arr => {
					this.edgeIndex.delete(key);
					// fix indices after idx
					for (let i = idx; i < arr.length - 1; i++) {
						this.edgeIndex.set(arr[i + 1].id, i);
					}
					return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
				});
			}
		});
	}

	/* 	public setAppearance(nodes: AppNode[], appearance: 'hidden' | 'dimmed' | 'normal') {
	
		} */

	public destroy() {
		this.unsubViewNodes?.();
		this.unsubViewEdges?.();
		this.unsubViewNodes = null;
		this.unsubViewEdges = null;
		this.nodeIndex.clear();
		this.edgeIndex.clear();
	}
}

//#endregion


//#region Utility Functions

function wouldCreateCycle(sourceId: string, targetId: string, map: Map<string, ViewEdge>): boolean {
	if (!sourceId || !targetId) return false;
	if (sourceId === targetId) return true;

	const adj: Map<string, Set<string>> = new Map();
	map.forEach((e) => {
		if (!adj.has(e.source)) adj.set(e.source, new Set());
		adj.get(e.source)!.add(e.target);
	});

	if (!adj.has(sourceId)) adj.set(sourceId, new Set());
	adj.get(sourceId)!.add(targetId);

	const visited = new Set<string>();
	const stack: string[] = [targetId];
	while (stack.length) {
		const node = stack.pop()!;
		if (node === sourceId) return true;
		if (visited.has(node)) continue;
		visited.add(node);
		const next = adj.get(node);
		if (next) for (const n of next) stack.push(n);
	}
	return false;
}

function getFlowPointFromEvent(
	event: MouseEvent | TouchEvent,
	screenToFlow: ((point: { x: number; y: number }) => { x: number; y: number }) | null
): { x: number; y: number } | null {
	try {
		if (!screenToFlow) return null;
		let clientX: number | null = null;
		let clientY: number | null = null;

		if (event instanceof MouseEvent) {
			clientX = event.clientX;
			clientY = event.clientY;
		} else if (event instanceof TouchEvent) {
			const t = event.changedTouches?.[0] || event.touches?.[0];
			if (t) {
				clientX = t.clientX;
				clientY = t.clientY;
			}
		}

		if (clientX == null || clientY == null) return null;
		return screenToFlow({ x: clientX, y: clientY });
	} catch {
		return null;
	}
}

const isValidConnection: IsValidConnection = (connection) => {
	const parentId = connection?.source ?? '';
	const childId = connection?.target ?? '';
	if (!parentId || !childId) return false;
	if (parentId === childId) return false;

	if (!reconnectionInProgress) {
		const sourceTask = appData.get(parentId);
		if (sourceTask?.children.includes(childId)) return false;

		const childTask = appData.get(childId);
		if (childTask?.parents.includes(parentId)) return false;
	}
	return !wouldCreateCycle(parentId, childId, viewEdges);
};

//#endregion


export const SvelteFlowEventHandlers = {
	oninit,
	ondelete,
	onnodeclick,
	onpaneclick,
	onnodedragstart,
	onnodedrag,
	onnodedragstop,
	onselectionchange,
	isValidConnection,
	onconnectstart,
	onconnect,
	onconnectend,
	onreconnectstart,
	onbeforereconnect,
	onreconnect,
	onreconnectend,
} satisfies NodeEvents<ViewNode> & NodeSelectionEvents<ViewNode> & EdgeEvents<ViewEdge> & PaneEvents & {
	isValidConnection?: IsValidConnection;
	onmovestart?: OnMoveStart;
	onmove?: OnMove;
	onmoveend?: OnMoveEnd;
	onflowerror?: OnError;
	ondelete?: OnDelete<ViewNode, ViewEdge> | undefined;
	onbeforedelete?: OnBeforeDelete<ViewNode, ViewEdge> | undefined;
	onbeforeconnect?: OnBeforeConnect<ViewEdge> | undefined;
	onconnect?: OnConnect;
	onconnectstart?: OnConnectStart;
	onconnectend?: OnConnectEnd;
	onreconnect?: OnReconnect<ViewEdge> | undefined;
	onreconnectstart?: OnReconnectStart<ViewEdge> | undefined;
	onreconnectend?: OnReconnectEnd<ViewEdge> | undefined;
	onbeforereconnect?: OnBeforeReconnect<ViewEdge> | undefined;
	onclickconnectstart?: OnConnectStart;
	onclickconnectend?: OnConnectEnd;
	oninit?: () => void;
	onselectionchange?: OnSelectionChange<ViewNode, ViewEdge> | undefined;
}