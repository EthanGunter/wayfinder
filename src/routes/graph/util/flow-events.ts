// util/flow-events.ts
import type { Connection } from '@xyflow/svelte';
import { get } from 'svelte/store';
import tasksAPI from '$lib/API/Tasks';
import {
	wouldCreateCycle,
	connectionExists,
	removeDuplicateEdges,
	refreshNodeData,
	getFlowPointFromEvent,
} from './graphNodeHandlers';
import type { Task } from '$domain/models/task';
import { taskById, nodes, edges, screenToFlowPosition } from './core-state';
import { drawerOpen, triggerForNew } from './ui-state';
import type { WFEdge } from '../types';

// Connection state - LOCAL to this module, not exported
let connectionSuccessful = false;
let connectionSourceNodeId: string | null = null;
let connectionHandleType: string | null = null;
let connectionDropPosition: { x: number; y: number } | null = null;

// Reconnection state - LOCAL to this module, not exported
let reconnectionSuccessful = false;
let reconnectionDetachEnd: 'source' | 'target' | null = null;
let reconnectionOldEdge: WFEdge | null = null;
let reconnectionInProgress = false;

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

export function handleConnectStart(
	_event: MouseEvent | TouchEvent,
	params: { nodeId: string | null; handleId: string | null; handleType: any }
) {
	if (reconnectionInProgress) return;
	connectionSourceNodeId = params?.nodeId ?? null;
	connectionHandleType = params?.handleType ?? null;
	connectionSuccessful = false;
}

export function handleReconnectStart(
	_event: MouseEvent | TouchEvent,
	edge: WFEdge,
	handleType: 'source' | 'target'
) {
	reconnectionSuccessful = false;
	reconnectionDetachEnd = handleType;
	reconnectionOldEdge = edge;
	reconnectionInProgress = true;
}

export async function handleConnect(connection: Connection) {
	connectionSuccessful = true;
	const parentId: string | undefined = connection?.source;
	const childId: string | undefined = connection?.target;
	if (!parentId || !childId || parentId === childId) return;

	(await tasksAPI.updateTask({
		id: parentId,
		data: {},
		relations: [{ id: childId, operation: 'addChild' }]
	}))[1]?.UNHANDLED();

	(await tasksAPI.updateTask({
		id: childId,
		data: {},
		relations: [{ id: parentId, operation: 'addParent' }]
	}))[1]?.UNHANDLED();

	nodes.set(refreshSpecificNodesForIds(get(nodes), [parentId, childId]));
}

export function handleBeforeReconnect(reconnectedEdge: WFEdge, oldEdge: WFEdge): WFEdge | false {
	const newSource = String(reconnectedEdge.source ?? oldEdge.source ?? '');
	const newTarget = String(reconnectedEdge.target ?? oldEdge.target ?? '');
	if (!newSource || !newTarget) return false;
	if (newSource === newTarget) return false;
	return { ...reconnectedEdge, type: (oldEdge as any).type ?? 'task' } as WFEdge;
}

export async function handleReconnect(
	oldEdge: WFEdge,
	newConnection: { source?: string; target?: string }
) {
	reconnectionSuccessful = true;
	const oldSource = String(oldEdge.source);
	const oldTarget = String(oldEdge.target);
	const newSource = String(newConnection?.source ?? oldSource);
	const newTarget = String(newConnection?.target ?? oldTarget);

	if (!newSource || !newTarget) return;
	if (newSource === oldSource && newTarget === oldTarget) return;

	(await tasksAPI.updateTask({
		id: oldSource,
		data: {},
		relations: [{ id: oldTarget, operation: 'removeChild' }]
	}))[1]?.UNHANDLED();

	(await tasksAPI.updateTask({
		id: oldTarget,
		data: {},
		relations: [{ id: oldSource, operation: 'removeParent' }]
	}))[1]?.UNHANDLED();

	if (!connectionExists(get(edges), newSource, newTarget)) {
		(await tasksAPI.updateTask({
			id: newSource,
			data: {},
			relations: [{ id: newTarget, operation: 'addChild' }]
		}))[1]?.UNHANDLED();

		(await tasksAPI.updateTask({
			id: newTarget,
			data: {},
			relations: [{ id: newSource, operation: 'addParent' }]
		}))[1]?.UNHANDLED();
	} else {
		edges.set(removeDuplicateEdges(get(edges)));
	}

	nodes.set(refreshNodeData(get(nodes), taskById));
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
			const pos = getFlowPointFromEvent(event as any, get(screenToFlowPosition)) || null;
			connectionDropPosition = pos;

			const srcId = connectionSourceNodeId;
			const triggerTask = srcId ? taskById.get(srcId) || null : null;
			if (triggerTask) {
				triggerForNew.set({
					task: triggerTask as Task,
					mode: connectionHandleType === 'source' ? 'parent' : 'child',
				});
				drawerOpen.set(true);
			}
		}
	}

	connectionSourceNodeId = null;
	connectionHandleType = null;
	connectionSuccessful = false;
};

export const handleReconnectEnd = async (
	event: MouseEvent | TouchEvent,
	edge: WFEdge,
	_handleType: 'source' | 'target',
	connectState: any
) => {
	if (!reconnectionSuccessful) {
		const droppedOnHandle =
			(event as Event)?.target &&
			(event.target as Element).closest?.('.svelte-flow__handle');
		const hasTarget = Boolean(connectState?.toNode || connectState?.toHandle);

		if (!droppedOnHandle && !hasTarget) {
			const src = String(edge.source);
			const tgt = String(edge.target);

			(await tasksAPI.updateTask({
				id: src,
				data: {},
				relations: [{ id: tgt, operation: 'removeChild' }]
			}))[1]?.UNHANDLED();

			(await tasksAPI.updateTask({
				id: tgt,
				data: {},
				relations: [{ id: src, operation: 'removeParent' }]
			}))[1]?.UNHANDLED();

			edges.set(get(edges).filter((e) => e.id !== edge.id));
			nodes.set(refreshNodeData(get(nodes), taskById));
		}
	}

	reconnectionSuccessful = false;
	reconnectionDetachEnd = null;
	reconnectionOldEdge = null;
	reconnectionInProgress = false;
};

export async function handleDelete(params: { nodes: { id: string }[]; edges: WFEdge[] }) {
	if (params.nodes.length > 0) {
		const ids = params.nodes.map((n) => n.id);
		(await tasksAPI.deleteTasks({ ids }))[1]?.UNHANDLED();
	}

	if (params.edges.length > 0) {
		const relationChanges = new Map<
			string,
			{
				id: string;
				operation: 'removeChild' | 'removeParent' | 'addChild' | 'addParent';
			}[]
		>();

		for (const edge of params.edges) {
			const sourceId = edge.source;
			const targetId = edge.target;

			if (!relationChanges.has(sourceId)) relationChanges.set(sourceId, []);
			relationChanges.get(sourceId)!.push({
				id: targetId,
				operation: 'removeChild',
			});

			if (!relationChanges.has(targetId)) relationChanges.set(targetId, []);
			relationChanges.get(targetId)!.push({
				id: sourceId,
				operation: 'removeParent',
			});
		}

		const updates = Array.from(relationChanges.entries()).map(([taskId, relations]) => ({
			id: taskId,
			data: {},
			relations,
		}));

		(await tasksAPI.updateTasks({ updates }))[1]?.UNHANDLED();
	}
}

// Local helper
function refreshSpecificNodesForIds(currentNodes: any[], ids: string[]) {
	return currentNodes.map((n) =>
		ids.includes(n.id) ? { ...n, data: { ...taskById.get(n.id) } } : n
	);
}