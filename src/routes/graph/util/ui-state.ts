import { writable, type Writable } from 'svelte/store';
import type { Task } from '$domain/models/task';
import type { TaskEditorLayoutState } from '../TaskEditor.svelte';

export type DrawerTrigger = { task: Task; mode: 'parent' | 'child' } | null;

export const selectedTask: Writable<Task | null> = writable(null);
export const drawerOpen: Writable<boolean> = writable(false);
export const triggerForNew: Writable<DrawerTrigger> = writable(null);

export const editorLayoutState: Writable<TaskEditorLayoutState> = writable({
	accordionValues: ['tasks'],
	showCompletedTasks: false,
	showCompletedSiblings: false
});

export function resetUIState() {
	selectedTask.set(null);
	drawerOpen.set(false);
	triggerForNew.set(null);
	editorLayoutState.set({
		accordionValues: ['tasks'],
		showCompletedTasks: false,
		showCompletedSiblings: false
	});
}