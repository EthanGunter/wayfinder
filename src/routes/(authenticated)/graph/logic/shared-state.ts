//#region STORES
import { get, writable, type Writable } from 'svelte/store';
import type { SvelteFlowInstance } from '@xyflow/svelte';
import type { AppNode } from '$domain/models/node';
import type { ViewNode, ViewEdge } from './layout/LayoutEngine';
import { ReadableMap } from '$lib/API/ReadableMap';
import type { LayoutNode } from './layout/LayoutEngine';
import { isTaskCompleted } from '$domain/models/task';
import { showCompletedNodes } from './ui-state';

/** Check if node should be shown based on visibility settings */
function shouldShowNode(appNode: AppNode): boolean {
	if (appNode.data.type !== 'task') return true;
	return get(showCompletedNodes) || !isTaskCompleted(appNode);
}


export const appData: ReadableMap<string, AppNode> = new ReadableMap();

export const viewNodes: ReadableMap<string, ViewNode> = new ReadableMap();
export const viewEdges: ReadableMap<string, ViewEdge> = new ReadableMap();

export const layoutPositions: ReadableMap<string, LayoutNode> = new ReadableMap();

// Helper to check if two arrays have the same elements (order-independent)
function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const setA = new Set(a);
	const setB = new Set(b);
	if (setA.size !== setB.size) return false;
	for (const item of setA) {
		if (!setB.has(item)) return false;
	}
	return true;
}


appData.subscribe(({ key, value, op }) => {
	if (op === "delete") {
		{
			const node = viewNodes.get(key);
			if (!node) return;

			// Remove edges where this node is the source
			for (const relation of node.data.appNode.children) {
				const edgeKey = getEdgeKey(node.id, relation);
				if (viewEdges.has(edgeKey)) {
					viewEdges.delete(edgeKey);
				}
			}

			// Remove edges where this node is the target
			for (const edge of viewEdges.values()) {
				if (edge.target === key) {
					// Normalize edge ID in case SvelteFlow added prefix
					const normalizedId = edge.id.startsWith('xy-edge__') ? edge.id.slice(9) : edge.id;
					viewEdges.delete(normalizedId);
					// Also try deleting with prefix if it exists
					if (edge.id !== normalizedId && viewEdges.has(edge.id)) {
						viewEdges.delete(edge.id);
					}
				}
			}

			viewNodes.delete(key);
		}
	} else {
		const existingNode = viewNodes.get(key);

		// Convert to arrays to handle Proxy objects from Svelte reactivity
		const oldChildren = existingNode ? Array.from(existingNode.data.appNode.children) : [];
		const oldParents = existingNode ? Array.from(existingNode.data.appNode.parents) : [];
		const newChildren = Array.from(value!.children);
		const newParents = Array.from(value!.parents);

		// Check if children or parents arrays actually changed
		const childrenChanged = !arraysEqual(oldChildren, newChildren);
		const parentsChanged = !arraysEqual(oldParents, newParents);

		let node: ViewNode;
		if (existingNode) {
			// Update the existing node
			node = {
				...existingNode, data: {
					...existingNode.data, appNode: value!
				},
			}
		} else {
			// Create a new node
			node = {
				id: key,
				position: { x: 0, y: 0 },
				type: value!.data.type,
				data: {
					appNode: value!,
				}
			}
		}

		// Only update child edges if children array actually changed
		if (childrenChanged) {
			// Remove edges for children that are no longer in the list
			const removedChildren = oldChildren.filter(child => !newChildren.includes(child));
			for (const removedChild of removedChildren) {
				const edgeKey = getEdgeKey(key, removedChild);
				if (viewEdges.has(edgeKey)) {
					viewEdges.delete(edgeKey);
				}
			}

			// Create edges only if target nodes exist in appData and both nodes are visible
			for (const relation of node.data.appNode.children) {
				const targetNode = appData.get(relation);
				if (targetNode && shouldShowNode(value!) && shouldShowNode(targetNode)) {
					const edge: ViewEdge = {
						id: getEdgeKey(key, relation),
						source: key,
						target: relation,
						type: value!.data.type,
					}
					viewEdges.set(getEdgeKey(key, relation), edge);
				}
			}
		}

		// Only add/update viewNode if it should be visible
		if (shouldShowNode(value!)) {
			viewNodes.set(key, node);
		} else if (existingNode) {
			// Node became hidden (e.g., was just completed) - remove it
			viewNodes.delete(key);
		}

		// Only update parent edges if parents array actually changed
		if (parentsChanged) {
			// Handle reverse edges: remove edges for parents that are no longer in the list
			const removedParents = oldParents.filter(parent => !newParents.includes(parent));
			for (const removedParent of removedParents) {
				const edgeKey = getEdgeKey(removedParent, key);
				if (viewEdges.has(edgeKey)) {
					viewEdges.delete(edgeKey);
				}
			}

			// Create reverse edges for new parents (only if both nodes are visible)
			for (const parentId of newParents) {
				const parentAppNode = appData.get(parentId);
				if (parentAppNode && shouldShowNode(parentAppNode) && shouldShowNode(value!) && !viewEdges.has(getEdgeKey(parentId, key))) {
					const edge: ViewEdge = {
						id: getEdgeKey(parentId, key),
						source: parentId,
						target: key,
						type: parentAppNode.data.type,
					}
					viewEdges.set(getEdgeKey(parentId, key), edge);
				}
			}
		}
	}
});
layoutPositions.subscribe(({ key, value, op }) => {
	if (op === 'delete' || !value) return;
	const node = viewNodes.get(key);
	if (!node) {
		return;
	}


	const EPS = 0.25;
	const dx = Math.abs(node.position.x - value.x);
	const dy = Math.abs(node.position.y - value.y);
	const draggingChanged = node.dragging !== value.fixed;

	if (dx < EPS && dy < EPS && !draggingChanged) return;

	// MUTATE instead of replace
	node.position.x = value.x;
	node.position.y = value.y;
	node.dragging = value.fixed;

	// Notify subscribers without creating new object
	viewNodes.set(key, node); // Same object reference
});


export const getEdgeKey = (source: string, target: string) => `${source}-${target}`;

// Flow library refs
export const svelteFlowInstance: Writable<SvelteFlowInstance | null> = writable(null);

//#endregion

//#region ACTIONS
export function resetGraphState() {
	appData.clear();
	viewNodes.clear();
	viewEdges.clear();
	svelteFlowInstance.set(null);
}
//#endregion