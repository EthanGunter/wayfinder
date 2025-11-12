import { writable, type Writable } from 'svelte/store';
import type { SvelteFlowInstance } from '@xyflow/svelte';
import type { Task } from '$domain/models/task';
import type { WFEdge, WFNode } from '../types';

// Core graph data
export const taskById = new Map<string, Task>();
export const allTasks: Writable<Task[]> = writable([]);
export const nodes: Writable<WFNode[]> = writable([]);
export const edges: Writable<WFEdge[]> = writable([]);

// Flow library references
export const svelteFlowInstance: Writable<SvelteFlowInstance | null> = writable(null);
export const screenToFlowPosition: Writable<
	((point: { x: number; y: number }) => { x: number; y: number }) | null
> = writable(null);

// Utility to clear graph data if needed
export function resetGraphState() {
	taskById.clear();
	allTasks.set([]);
	nodes.set([]);
	edges.set([]);
	svelteFlowInstance.set(null);
	screenToFlowPosition.set(null);
}