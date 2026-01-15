// ui/state.ts
//#region STORES
import { get, writable } from 'svelte/store';
import type { NodeEditorLayoutState } from '../TaskEditor.svelte';
import type { AppNode } from '$domain/models/node';
import { isTaskCompleted } from '$domain/models/task';
import {
	appData,
	viewNodes,
	viewEdges,
	getEdgeKey,
	recalculateHiddenByCollapse,
	hiddenByCollapse,
} from './shared-state';
import { appToView } from './layout/LayoutEngine';
import { getCollapsedNodeIds } from './data-persistence';
import { settings } from '$lib/config/user-settings';

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
showCompletedNodes.subscribe(syncVisibleNodesForCompletion);

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

function syncVisibleNodesForCompletion(showCompleted: boolean) {
	const persistedCollapsed = getCollapsedNodeIds();

	// Pass 1: ensure nodes are present/absent based solely on completion state.
	for (const [id, appNode] of appData.entries()) {
		if (appNode.data.type === 'project') continue;

		const isCompleted = appNode.data.type === 'task' && isTaskCompleted(appNode);
		const shouldRender = showCompleted || !isCompleted;
		const existing = viewNodes.get(id);

		if (shouldRender) {
			const viewNode = existing ? appToView(appNode, existing) : appToView(appNode);
			if (persistedCollapsed.has(id)) {
				viewNode.data.collapsedChildren = true;
			}
			viewNodes.set(id, viewNode);
		} else if (existing) {
			for (const childId of appNode.children) {
				viewEdges.delete(getEdgeKey(id, childId));
			}
			for (const parentId of appNode.parents) {
				viewEdges.delete(getEdgeKey(parentId, id));
			}
			viewNodes.delete(id);
		}
	}

	// Pass 2: rebuild edges between currently visible nodes.
	viewEdges.clear();
	for (const [id, appNode] of appData.entries()) {
		if (!viewNodes.has(id)) continue;
		for (const childId of appNode.children) {
			if (viewNodes.has(childId)) {
				viewEdges.set(getEdgeKey(id, childId), {
					id: getEdgeKey(id, childId),
					source: id,
					target: childId,
					type: 'task',
				});
			}
		}
	}

	// Pass 3: honor collapsed visibility and prune hidden descendants.
	recalculateHiddenByCollapse();
	const hidden = get(hiddenByCollapse);
	if (hidden.size === 0) return;

	for (const hiddenId of hidden) {
		const appNode = appData.get(hiddenId);
		if (!appNode) continue;

		for (const childId of appNode.children) {
			viewEdges.delete(getEdgeKey(hiddenId, childId));
		}
		for (const parentId of appNode.parents) {
			viewEdges.delete(getEdgeKey(parentId, hiddenId));
		}
		viewNodes.delete(hiddenId);
	}
}