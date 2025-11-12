import type { SvelteFlowInstance } from '@xyflow/svelte';
import type { Task } from '$domain/models/task';
import type { WFEdge, WFNode } from '../types';
import { get } from 'svelte/store';
import { nodes, svelteFlowInstance } from './core-state';
import { selectedTask } from './ui-state';

// Computes ancestor/descendant relations to mark related nodes for dimming.
// Depth: 1 = direct only, -1 = unlimited.
export function computeRelatedTasks(
	matchingIds: Set<string>,
	taskById: Map<string, Task>,
	includeRelated: boolean,
	relatedDepth: number
): { matching: Set<string>; related: Set<string> } {
	if (!includeRelated) return { matching: matchingIds, related: new Set() };

	const related = new Set<string>();
	const visited = new Set<string>();

	const walkUp = (id: string, depth: number) => {
		if (visited.has(id)) return;
		visited.add(id);
		const t = taskById.get(id);
		if (!t) return;
		for (const p of t.parents) {
			if (!matchingIds.has(p)) related.add(p);
			if (relatedDepth === -1 || depth < relatedDepth) walkUp(p, depth + 1);
		}
	};

	const walkDown = (id: string, depth: number) => {
		if (visited.has(id)) return;
		visited.add(id);
		const t = taskById.get(id);
		if (!t) return;
		for (const c of t.children) {
			if (!matchingIds.has(c)) related.add(c);
			if (relatedDepth === -1 || depth < relatedDepth) walkDown(c, depth + 1);
		}
	};

	for (const id of matchingIds) {
		visited.clear();
		walkUp(id, 1);
		visited.clear();
		walkDown(id, 1);
	}

	return { matching: matchingIds, related };
}

// Applies visibility and dimming to nodes/edges output, but more importantly returns the
// filtered task ids to drive pre-layout filtering.
export function applyVisibilityToGraph(
	nodes: WFNode[],
	edges: WFEdge[],
	filter: { matching: Set<string>; related: Set<string> } | null
): { nodes: WFNode[]; edges: WFEdge[] } {
	if (!filter) {
		return {
			nodes: nodes.map((n) => ({ ...n, data: { ...n.data, dimmed: false } })),
			edges: edges.map((e) => ({ ...e, data: { ...e.data!, dimmed: false } })),
		};
	}

	const dimRelated = (id: string) => filter.related.has(id);

	const nextNodes = nodes.map((n) => ({
		...n,
		data: { ...n.data, dimmed: dimRelated(n.id) },
	}));

	const nextEdges = edges.map((e) => ({
		...e,
		data: { ...e.data!, dimmed: dimRelated(e.source) || dimRelated(e.target) },
	}));

	return { nodes: nextNodes, edges: nextEdges };
}

// Filter a set of tasks to those visible to the layout.
// Runs BEFORE layout; hidden tasks are excluded entirely from layout.
export function filterTasksForLayout(
	allTasks: Task[],
	filter: { matching: Set<string>; related: Set<string> } | null
): Task[] {
	if (!filter) return allTasks;
	const visibleIds = new Set([...filter.matching, ...filter.related]);
	return allTasks.filter((t) => visibleIds.has(t.id));
}

// Center and optionally highlight a node. Pure appearance utility.
export function centerNode(
	instance: SvelteFlowInstance | null,
	node: WFNode | undefined,
	options: { select?: boolean; zoom?: number } = { select: true, zoom: 1.5 }
) {
	if (!instance || !node || typeof instance.setCenter !== 'function') return;

	instance.setCenter(node.position.x, node.position.y, {
		duration: 250,
		zoom: options.zoom ?? 1.5,
	});

	const el = document.querySelector(`[data-tasknodeid="${node.id}"]`) as HTMLElement | null;
	if (el) {
		el.dispatchEvent(new CustomEvent('highlight', { bubbles: false }));
	}
}

// DOM highlight helper by id (without lookup)
export function highlightNodeById(taskId: string) {
	const el = document.querySelector(`[data-tasknodeid="${taskId}"]`) as HTMLElement | null;
	if (el) {
		el.dispatchEvent(new CustomEvent('highlight', { bubbles: false }));
	}
}

export function highlightNode(taskId: string, options: { select?: boolean } = { select: true }) {
	const node = get(nodes).find((n) => n.id === taskId);
	centerNode(get(svelteFlowInstance), node, { select: options?.select !== false });
	if (options?.select && node?.data?.type === 'task') {
		selectedTask.set(node.data as unknown as Task) ?? null;
	}
}