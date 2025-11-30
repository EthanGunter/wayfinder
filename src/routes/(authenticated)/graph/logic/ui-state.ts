// ui/state.ts
//#region STORES
import { get, writable, type Writable } from 'svelte/store';
import { isTaskCompleted, type Task } from '$domain/models/task';
import type { NodeEditorLayoutState } from '../TaskEditor.svelte';
import type { AppNode } from '$domain/models/node';
import { appData, viewNodes, viewEdges, getEdgeKey } from './shared-state';
import { appToView } from './layout/LayoutEngine';
import { settings } from '$lib/user-settings';

export type DrawerParams = { relation: AppNode; mode: 'parent' | 'child' } | null;

export type PendingNodeIntent = {
	// one of these will be present at different phases
	id?: string;
	pos?: { x: number; y: number };

	// TODO optional timestamp to expire if needed
	ts?: number;
};

export const autoLayout = settings.graph.core.autoLayout;
export const showCompletedNodes = settings.graph.core.showCompleted;
showCompletedNodes.subscribe((show) => {
	// Iterate appData (always populated) not viewNodes
	for (const [id, appNode] of appData.entries()) {
		if (appNode.data.type !== 'task' || !isTaskCompleted(appNode)) continue;

		if (show) {
			// Re-add completed nodes if not present
			if (!viewNodes.has(id)) {
				viewNodes.set(id, appToView(appNode));
				// Re-add edges for this node
				for (const childId of appNode.children) {
					if (viewNodes.has(childId)) {
						viewEdges.set(getEdgeKey(id, childId), {
							id: getEdgeKey(id, childId),
							source: id,
							target: childId,
							type: appNode.data.type,
						});
					}
				}
				for (const parentId of appNode.parents) {
					if (viewNodes.has(parentId)) {
						viewEdges.set(getEdgeKey(parentId, id), {
							id: getEdgeKey(parentId, id),
							source: parentId,
							target: id,
							type: appNode.data.type,
						});
					}
				}
			}
		} else {
			// Remove completed nodes
			if (viewNodes.has(id)) {
				// Remove edges first
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
});

export const pendingNodeParams = writable<PendingNodeIntent>({});
export const selectedNode = writable<AppNode<unknown> | null>(null);
export const drawerOpen = writable<boolean>(false);
export const drawerParams = writable<DrawerParams>(null);
export const layoutPaused = writable<boolean>(true);

export const editorLayoutState = writable<NodeEditorLayoutState>({
	accordionValues: ['tasks'],
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
		accordionValues: ['tasks'],
		showCompletedTasks: false,
		showCompletedSiblings: false,
	});
}
//#endregion