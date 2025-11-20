// flow/index.ts
//#region IMPORTS
import type { Connection } from '@xyflow/svelte';
import { get } from 'svelte/store';
import tasksAPI from '$lib/API/Tasks';
import { nodes, edges, taskById, screenToFlowPosition } from './shared-state';
import { drawerOpen, drawerParams, pendingNodeParams } from './ui-state';
import type { FlowEdge, FlowNode } from '../types';
import type { UpdateTaskParams } from '$domain/models/task';
//#endregion

//#region LOCAL STATE
let connectionSuccessful = false;
let connectionSourceNodeId: string | null = null;
let connectionHandleType: string | null = null;

let reconnectionSuccessful = false;
let reconnectionDetachEnd: 'source' | 'target' | null = null;
let reconnectionOldEdge: FlowEdge | null = null;
let reconnectionInProgress = false;
//#endregion

//#region CONSTRAINTS
export function wouldCreateCycle(sourceId: string, targetId: string, list: FlowEdge[]): boolean {
	if (!sourceId || !targetId) return false;
	if (sourceId === targetId) return true;

	const adj: Map<string, Set<string>> = new Map();
	for (const e of list) {
		if (!adj.has(e.source)) adj.set(e.source, new Set());
		adj.get(e.source)!.add(e.target);
	}

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

export function connectionExists(list: FlowEdge[], sourceId: string, targetId: string): boolean {
	return list.some((e) => e.source === sourceId && e.target === targetId);
}

export function removeDuplicateEdges(list: FlowEdge[]): FlowEdge[] {
	return list.filter(
		(e, idx, arr) => arr.findIndex((f) => f.source === e.source && f.target === e.target) === idx
	);
}
//#endregion

//#region GEOMETRY
export function getFlowPointFromEvent(
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
//#endregion

//#region INTERNAL HELPERS
function refreshNodesDataFor(ids: string[]) {
	const set = new Set(ids);
	nodes.set(
		get(nodes).map((n) => {
			if (!set.has(n.id)) return n;
			const t = taskById.get(n.id);
			return t ? { ...n,  task: t }  : n;
		})
	);
}
//#endregion

//#region VALIDATION
export function isValidConnection(connection: { source?: string; target?: string }): boolean {
	const parentId = connection?.source ?? '';
	const childId = connection?.target ?? '';
	if (!parentId || !childId) return false;
	if (parentId === childId) return false;

	if (!reconnectionInProgress) {
		const sourceTask = taskById.get(parentId);
		if (sourceTask?.children.includes(childId)) return false;

		const childTask = taskById.get(childId);
		if (childTask?.parents.includes(parentId)) return false;
	}
	return !wouldCreateCycle(parentId, childId, get(edges));
}
//#endregion

//#region CONNECT HANDLERS
export function handleConnectStart(
	_event: MouseEvent | TouchEvent,
	params: { nodeId: string | null; handleId: string | null; handleType: any }
) {
	if (reconnectionInProgress) return;
	connectionSourceNodeId = params?.nodeId ?? null;
	connectionHandleType = params?.handleType ?? null;
	connectionSuccessful = false;
}

export async function handleConnect(connection: Connection) {
	connectionSuccessful = true;
	const parentId: string | undefined = connection?.source;
	const childId: string | undefined = connection?.target;
	if (!parentId || !childId || parentId === childId) return;

	const [_, error] = await tasksAPI.updateTask({
		id: parentId,
		 addChildren: [childId] ,
	})
	error?.UNHANDLED();

	refreshNodesDataFor([parentId, childId]);
}

export const handleConnectEnd = (event: MouseEvent | TouchEvent, connectState: any) => {
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
			const triggerTask = srcId ? taskById.get(srcId) || null : null;
			if (triggerTask) {
				drawerParams.set({
					relation: triggerTask,
					mode: connectionHandleType === 'source' ? 'parent' : 'child',
				});

				const pos = getFlowPointFromEvent(event, get(screenToFlowPosition)) || null;
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
//#endregion

//#region RECONNECT HANDLERS
export function handleReconnectStart(
	_event: MouseEvent | TouchEvent,
	edge: FlowEdge,
	handleType: 'source' | 'target'
) {
	reconnectionSuccessful = false;
	reconnectionDetachEnd = handleType;
	reconnectionOldEdge = edge;
	reconnectionInProgress = true;
}

export function handleBeforeReconnect(reconnectedEdge: FlowEdge, oldEdge: FlowEdge): FlowEdge | false {
	const newSource = String(reconnectedEdge.source ?? oldEdge.source ?? '');
	const newTarget = String(reconnectedEdge.target ?? oldEdge.target ?? '');
	if (!newSource || !newTarget) return false;
	if (newSource === newTarget) return false;
	return { ...reconnectedEdge, type: (oldEdge).type ?? 'task' };
}

export async function handleReconnect(
	oldEdge: FlowEdge,
	newConnection: { source?: string; target?: string }
) {
	reconnectionSuccessful = true;
	const oldSource = String(oldEdge.source);
	const oldTarget = String(oldEdge.target);
	const newSource = String(newConnection?.source ?? oldSource);
	const newTarget = String(newConnection?.target ?? oldTarget);

	if (!newSource || !newTarget) return;
	if (newSource === oldSource && newTarget === oldTarget) return;

	const [_, error] = await tasksAPI.updateTask({
		id: oldSource,
		 removeChildren: [oldTarget] ,
	})
	error?.UNHANDLED();

	if (!connectionExists(get(edges), newSource, newTarget)) {
		const [_, error] = await tasksAPI.updateTask({
			id: newSource,
			 addChildren: [newTarget] ,
		})
		error?.UNHANDLED();
	} else {
		edges.set(removeDuplicateEdges(get(edges)));
	}

	refreshNodesDataFor([oldSource, oldTarget, newSource, newTarget]);
}

export const handleReconnectEnd = async (
	event: MouseEvent | TouchEvent,
	edge: FlowEdge,
	_handleType: 'source' | 'target',
	connectState: any
) => {
	if (!reconnectionSuccessful) {
		const droppedOnHandle =
			(event as Event)?.target && (event.target as Element).closest?.('.svelte-flow__handle');
		const hasTarget = Boolean(connectState?.toNode || connectState?.toHandle);

		if (!droppedOnHandle && !hasTarget) {
			const src = String(edge.source);
			const tgt = String(edge.target);

			const [_, error] = await tasksAPI.updateTask({
				id: src,
				 removeChildren: [tgt] ,
			})
			error?.UNHANDLED();

			edges.set(get(edges).filter((e) => e.id !== edge.id));
			refreshNodesDataFor([src, tgt]);
		}
	}

	reconnectionSuccessful = false;
	reconnectionDetachEnd = null;
	reconnectionOldEdge = null;
	reconnectionInProgress = false;
};
//#endregion

//#region DELETE

export async function handleDelete(params: { nodes: FlowNode[]; edges: FlowEdge[] }) {
	// If node deleted
	if (params.nodes.length > 0) {
		const ids = params.nodes.map((n) => n.id);
		(await tasksAPI.deleteTasks({ ids }))[1]?.UNHANDLED();
	}

	// If edge deleted
	if (params.edges.length > 0) {
		const childrenToRemove = new Map<string, string[]>();
		const parentsToRemove = new Map<string, string[]>();

		for (const edge of params.edges) {
			const sourceId = edge.source;
			const targetId = edge.target;

			if (!childrenToRemove.has(sourceId)) childrenToRemove.set(sourceId, []);
			childrenToRemove.get(sourceId)!.push(targetId);

			if (!parentsToRemove.has(targetId)) parentsToRemove.set(targetId, []);
			parentsToRemove.get(targetId)!.push(sourceId);
		}

		const updates: UpdateTaskParams[] = [];

		for (const [taskId, childIds] of childrenToRemove.entries()) {
			updates.push({
				id: taskId,
				 removeChildren: childIds ,
			});
		}

		for (const [taskId, parentIds] of parentsToRemove.entries()) {
			updates.push({
				id: taskId,
				 removeParents: parentIds ,
			});
		}

		const [_, error] = await tasksAPI.updateTasks({ updates })
		error?.UNHANDLED();
	}
}
//#endregion