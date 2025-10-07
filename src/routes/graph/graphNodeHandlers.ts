import type { Node, Edge } from '@xyflow/svelte';
import type { Task } from '$lib/API/Tasks/Task';
import type { ITasksLocal } from '$lib/API/Tasks';

/**
 * Updates parent/child relationships between tasks
 */
export async function updateTaskRelationship(
	tasksAPI: ITasksLocal,
	taskById: Map<string, Task>,
	parentId: string,
	childId: string,
	action: 'add' | 'remove'
): Promise<void> {
	const parent = taskById.get(parentId);
	const child = taskById.get(childId);
	if (!parent || !child) return;

	const parentOperation = action === 'add' ? 'addChild' : 'removeChild';
	const childOperation = action === 'add' ? 'addParent' : 'removeParent';

	await tasksAPI.updateTasks({
		updates: [
			{
				id: parentId,
				relations: [{ id: childId, operation: parentOperation }]
			},
			{
				id: childId,
				relations: [{ id: parentId, operation: childOperation }]
			}
		]
	});
}

/**
 * Refreshes node data with latest task information
 */
export function refreshNodeData(nodes: Node[], taskById: Map<string, Task>): Node[] {
	return nodes.map((n) => {
		const task = taskById.get(n.id);
		return task ? { ...n, data: task as any } : n;
	});
}

/**
 * Refreshes specific nodes by IDs
 */
export function refreshSpecificNodes(
	nodes: Node[],
	taskById: Map<string, Task>,
	nodeIds: string[]
): Node[] {
	return nodes.map((n) => {
		if (nodeIds.includes(n.id)) {
			const task = taskById.get(n.id);
			return task ? { ...n, data: task as any } : n;
		}
		return n;
	});
}

/**
 * Detects if adding an edge would create a cycle
 */
export function wouldCreateCycle(
	sourceId: string,
	targetId: string,
	edges: Edge[]
): boolean {
	if (!sourceId || !targetId) return false;
	if (sourceId === targetId) return true;

	// Build adjacency map from current edges
	const adj: Map<string, Set<string>> = new Map();
	for (const e of edges) {
		if (!adj.has(e.source)) adj.set(e.source, new Set());
		adj.get(e.source)!.add(e.target);
	}

	// Add the candidate edge
	if (!adj.has(sourceId)) adj.set(sourceId, new Set());
	adj.get(sourceId)!.add(targetId);

	// DFS from target; if we can reach source, adding edge closes a cycle
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

/**
 * Checks if a connection already exists between two nodes
 */
export function connectionExists(edges: Edge[], sourceId: string, targetId: string): boolean {
	return edges.some((e) => e.source === sourceId && e.target === targetId);
}

/**
 * Removes duplicate edges, keeping the first occurrence
 */
export function removeDuplicateEdges(edges: Edge[]): Edge[] {
	return edges.filter(
		(e, idx, arr) => arr.findIndex((f) => f.source === e.source && f.target === e.target) === idx
	);
}

/**
 * Extracts screen coordinates from mouse/touch events
 */
export function getFlowPointFromEvent(
	event: MouseEvent | TouchEvent,
	screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | null
): { x: number; y: number } | null {
	try {
		if (!screenToFlowPosition) return null;
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
		return screenToFlowPosition({ x: clientX, y: clientY });
	} catch {
		return null;
	}
}
