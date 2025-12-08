// ui/state.ts
//#region STORES
import { writable } from 'svelte/store';
import type { NodeEditorLayoutState } from '../TaskEditor.svelte';
import type { AppNode } from '$domain/models/node';
import { appData, viewNodes, viewEdges, getEdgeKey, recalculateHiddenByCollapse, shouldShowNode } from './shared-state';
import { appToView } from './layout/LayoutEngine';
import { getCollapsedNodeIds } from './data-persistence';
import { settings } from '$lib/user-settings';

export type DrawerParams = { relation: AppNode; mode: 'parent' | 'child' } | null;

export type PendingNodeIntent = {
	// one of these will be present at different phases
	id?: string;
	pos?: { x: number; y: number };

	// TODO optional timestamp to expire if needed
	ts?: number;
};

export const autoLayout = settings.graph.layout.autoLayout;
export const showCompletedNodes = settings.graph.core.showCompleted;
showCompletedNodes.subscribe(() => {
	const persistedCollapsed = getCollapsedNodeIds();

	for (const [id, appNode] of appData.entries()) {
		const shouldShow = shouldShowNode(appNode);
		const existsInView = viewNodes.has(id);

		if (shouldShow && !existsInView) {
			// Add to view with restored collapse state
			const viewNode = appToView(appNode);
			if (persistedCollapsed.has(id)) {
				viewNode.data.collapsedChildren = true;
			}
			viewNodes.set(id, viewNode);

			// Re-add edges to visible nodes
			for (const childId of appNode.children) {
				const childNode = appData.get(childId);
				if (childNode && shouldShowNode(childNode)) {
					viewEdges.set(getEdgeKey(id, childId), {
						id: getEdgeKey(id, childId),
						source: id,
						target: childId,
						type: 'task',
					});
				}
			}
			for (const parentId of appNode.parents) {
				const parentNode = appData.get(parentId);
				if (parentNode && shouldShowNode(parentNode)) {
					viewEdges.set(getEdgeKey(parentId, id), {
						id: getEdgeKey(parentId, id),
						source: parentId,
						target: id,
						type: 'task',
					});
				}
			}
		} else if (!shouldShow && existsInView) {
			// Remove from view
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		}
	}

	// Re-added nodes may have restored collapse state - recalculate and hide their descendants
	recalculateHiddenByCollapse();

	for (const [id, appNode] of appData.entries()) {
		if (!shouldShowNode(appNode) && viewNodes.has(id)) {
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		}
	}
});

export const pendingNodeParams = writable<PendingNodeIntent>({});
export const selectedNode = writable<AppNode<unknown> | null>(null);
export const drawerOpen = writable<boolean>(false);
export const drawerParams = writable<DrawerParams>(null);
export const layoutPaused = writable<boolean>(true);

export const editorLayoutState = writable<NodeEditorLayoutState>({
	accordionValues: ['blockers', 'priority'],
	showCompletedTasks: false,
	showCompletedSiblings: false,
});
//#endregion

//#region ACTIONS
export function resetUIState() {
	selectedNode.set(null);
	drawerOpen.set(false);
	drawerParams.set(null);
	editorLayoutState.set({
		accordionValues: ['blockers', 'priority'],
		showCompletedTasks: false,
		showCompletedSiblings: false,
	});
}
//#endregion