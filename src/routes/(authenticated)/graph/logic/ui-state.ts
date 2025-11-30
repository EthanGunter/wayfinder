// ui/state.ts
//#region STORES
import { writable, type Writable } from 'svelte/store';
import type { Task } from '$domain/models/task';
import type { TaskEditorLayoutState } from '../TaskEditor.svelte';
import type { GraphNode } from '$domain/models/node';
import { settings } from '$lib/user-settings';

export type DrawerParams = { relation: GraphNode; mode: 'parent' | 'child' } | null;

export type PendingNodeIntent = {
	// one of these will be present at different phases
	id?: string;
	pos?: { x: number; y: number };

	// TODO optional timestamp to expire if needed
	ts?: number;
};

export const showCompleted = settings.graph.core.showCompleted;


export const pendingNodeParams = writable<PendingNodeIntent>({});
export const selectedTask: Writable<Task | null> = writable(null);
export const drawerOpen: Writable<boolean> = writable(false);
export const drawerParams: Writable<DrawerParams> = writable(null);

export const editorLayoutState: Writable<TaskEditorLayoutState> = writable({
	accordionValues: ['tasks'],
	showCompletedTasks: false,
	showCompletedSiblings: false,
});
//#endregion

//#region ACTIONS
export function resetUIState() {
	selectedTask.set(null);
	drawerOpen.set(false);
	drawerParams.set(null);
	editorLayoutState.set({
		accordionValues: ['tasks'],
		showCompletedTasks: false,
		showCompletedSiblings: false,
	});
}
//#endregion