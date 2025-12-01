//#region STORES
import { get, writable, type Writable } from 'svelte/store';
import type { SvelteFlowInstance } from '@xyflow/svelte';
import type { AppNode } from '$domain/models/node';
import type { ViewNode, ViewEdge } from './layout/LayoutEngine';
import { ReadableMap } from '$lib/API/ReadableMap';
import { isTaskCompleted } from '$domain/models/task';
import { showCompletedNodes } from './ui-state';
import { getCollapsedNodeIds, setNodeCollapsed, clearNodeCollapsed } from './data-persistence';

/** Set of all node IDs currently hidden due to collapsed ancestors */
export const hiddenByCollapse: Writable<Set<string>> = writable(new Set());

/** Check if node should be shown based on visibility settings */
export function shouldShowNode(appNode: AppNode): boolean {
	if (appNode.data.type !== 'task') return true;
	if (get(hiddenByCollapse).has(appNode.id)) return false;
	return get(showCompletedNodes) || !isTaskCompleted(appNode);
}


export const appData: ReadableMap<string, AppNode> = new ReadableMap();

export const viewNodes: ReadableMap<string, ViewNode> = new ReadableMap();
export const viewEdges: ReadableMap<string, ViewEdge> = new ReadableMap();

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


export const getEdgeKey = (source: string, target: string) => `${source}-${target}`;

// Flow library refs
export const svelteFlowInstance: Writable<SvelteFlowInstance | null> = writable(null);

//#endregion

//#region ACTIONS
export function resetGraphState() {
	appData.clear();
	viewNodes.clear();
	viewEdges.clear();
	hiddenByCollapse.set(new Set());
	svelteFlowInstance.set(null);
}

/**
 * Recalculates the hiddenByCollapse set based on current collapse state.
 * A node is hidden if all paths to visible ancestors pass through collapsed nodes.
 */
export function recalculateHiddenByCollapse() {
	const newHidden = new Set<string>();

	// Find all nodes with collapsedChildren: true
	const collapseRoots: string[] = [];
	for (const [id, node] of viewNodes.entries()) {
		if (node.data.collapsedChildren) {
			collapseRoots.push(id);
		}
	}

	if (collapseRoots.length === 0) {
		hiddenByCollapse.set(newHidden);
		return;
	}

	// For each collapse root, traverse descendants and mark them as potentially hidden
	// A node is hidden if ALL its parents are either hidden or collapsed
	const potentiallyHidden = new Set<string>();

	// BFS to collect all descendants of collapsed nodes
	for (const rootId of collapseRoots) {
		const appNode = appData.get(rootId);
		if (!appNode) continue;

		const queue = [...appNode.children];
		while (queue.length > 0) {
			const childId = queue.shift()!;
			if (potentiallyHidden.has(childId)) continue;
			potentiallyHidden.add(childId);

			const childAppNode = appData.get(childId);
			if (childAppNode) {
				queue.push(...childAppNode.children);
			}
		}
	}

	// Now determine which are actually hidden
	// A node is hidden if ALL its parents are either:
	// 1. In the hidden set, OR
	// 2. Have collapsedChildren: true
	// We need to iterate until stable since hiding is transitive
	let changed = true;
	while (changed) {
		changed = false;
		for (const nodeId of potentiallyHidden) {
			if (newHidden.has(nodeId)) continue;

			const appNode = appData.get(nodeId);
			if (!appNode) continue;

			// Check if all parents lead to hidden state
			const allParentsBlocked = appNode.parents.length > 0 && appNode.parents.every(parentId => {
				// Parent is hidden
				if (newHidden.has(parentId)) return true;
				// Parent has collapsed children (this node is a child, so it's blocked)
				const parentViewNode = viewNodes.get(parentId);
				if (parentViewNode?.data.collapsedChildren) return true;
				return false;
			});

			if (allParentsBlocked) {
				newHidden.add(nodeId);
				changed = true;
			}
		}
	}

	hiddenByCollapse.set(newHidden);
}

/**
 * Toggle collapse state for a node's children.
 * When collapsed, descendants without an uncollapsed path will be hidden.
 */
export function toggleCollapseChildren(nodeId: string, recursive: boolean = false) {
	const node = viewNodes.get(nodeId);
	if (!node) return;

	const newCollapsed = !node.data.collapsedChildren;

	// Collect all nodes to toggle
	const nodesToToggle: string[] = [nodeId];

	if (recursive) {
		const appNode = appData.get(nodeId);
		if (appNode) {
			const queue = [...appNode.children];
			const visited = new Set<string>([nodeId]);

			while (queue.length > 0) {
				const childId = queue.shift()!;
				if (visited.has(childId)) continue;
				visited.add(childId);

				const childAppNode = appData.get(childId);
				if (childAppNode && childAppNode.children.length > 0) {
					nodesToToggle.push(childId);
					queue.push(...childAppNode.children);
				}
			}
		}
	}

	// Update all nodes' collapse state and persist
	for (const id of nodesToToggle) {
		const n = viewNodes.get(id);
		if (n) {
			viewNodes.set(id, {
				...n,
				data: { ...n.data, collapsedChildren: newCollapsed || undefined }
			});

			if (newCollapsed) {
				setNodeCollapsed(id);
			} else {
				clearNodeCollapsed(id);
			}
		}
	}

	// Recalculate which nodes should be hidden
	recalculateHiddenByCollapse();

	// Apply visibility changes to viewNodes and viewEdges
	const hidden = get(hiddenByCollapse);
	const persistedCollapsed = getCollapsedNodeIds();

	for (const [id, appNode] of appData.entries()) {
		const isHidden = hidden.has(id);
		const existsInView = viewNodes.has(id);

		if (isHidden && existsInView) {
			// Remove from view
			// First remove edges
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		} else if (!isHidden && !existsInView && shouldShowNode(appNode)) {
			// Add back to view, restoring collapse state from persistence
			viewNodes.set(id, {
				id,
				position: { x: 0, y: 0 },
				type: appNode.data.type,
				data: {
					appNode,
					collapsedChildren: persistedCollapsed.has(id) || undefined
				}
			});
			// Re-add edges
			for (const childId of appNode.children) {
				const childNode = appData.get(childId);
				if (childNode && !hidden.has(childId) && shouldShowNode(childNode)) {
					viewEdges.set(getEdgeKey(id, childId), {
						id: getEdgeKey(id, childId),
						source: id,
						target: childId,
						type: appNode.data.type,
					});
				}
			}
			for (const parentId of appNode.parents) {
				const parentNode = appData.get(parentId);
				if (parentNode && !hidden.has(parentId) && shouldShowNode(parentNode)) {
					viewEdges.set(getEdgeKey(parentId, id), {
						id: getEdgeKey(parentId, id),
						source: parentId,
						target: id,
						type: parentNode.data.type,
					});
				}
			}
		}
	}

	// Re-added nodes may have restored collapse state - recalculate and hide their descendants
	recalculateHiddenByCollapse();
	const newHidden = get(hiddenByCollapse);
	
	for (const [id, appNode] of appData.entries()) {
		if (newHidden.has(id) && viewNodes.has(id)) {
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		}
	}
}

/**
 * Restores collapse state from localStorage and applies it to the current view.
 * Call after initial data has loaded.
 */
export function restoreCollapseState() {
	const collapsedIds = getCollapsedNodeIds();
	if (collapsedIds.size === 0) return;

	// Apply collapse state to existing viewNodes
	for (const nodeId of collapsedIds) {
		const node = viewNodes.get(nodeId);
		if (node) {
			viewNodes.set(nodeId, {
				...node,
				data: { ...node.data, collapsedChildren: true }
			});
		}
	}

	// Recalculate and apply visibility
	recalculateHiddenByCollapse();
	const hidden = get(hiddenByCollapse);

	for (const [id, appNode] of appData.entries()) {
		const isHidden = hidden.has(id);
		const existsInView = viewNodes.has(id);

		if (isHidden && existsInView) {
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		}
	}
}
//#endregion