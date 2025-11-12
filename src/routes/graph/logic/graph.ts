//#region IMPORTS
import type { WFEdge, WFNode } from '../types';
import type { Task } from '$domain/models/task';
import { get } from 'svelte/store';
import { elkLayoutEngine } from './LayoutEngines';
import { allTasks, taskById, nodes, edges } from './shared-state';
import { filteredIds } from './search';
//#endregion

//#region INTERNAL HELPERS
function buildVisibleIdSet(): Set<string> | null {
	const f = get(filteredIds);
	if (!f) return null;
	return new Set<string>([...f.matching, ...f.related]);
}

function selectTasksForLayout(all: Task[], visible: Set<string> | null): Task[] {
	if (!visible) return all;
	return all.filter((t) => visible.has(t.id));
}

function decorateDimming(
	currentNodes: WFNode[],
	currentEdges: WFEdge[],
): { nodes: WFNode[]; edges: WFEdge[] } {
	const f = get(filteredIds);
	if (!f) {
		return {
			nodes: currentNodes.map((n) => ({ ...n, data: { ...n.data, dimmed: false } })),
			edges: currentEdges.map((e) => ({ ...e, data: { ...e.data!, dimmed: false } })),
		};
	}
	const dimRelated = (id: string) => f.related.has(id);
	const nextNodes = currentNodes.map((n) => ({
		...n,
		data: { ...n.data, dimmed: dimRelated(n.id) },
	}));
	const nextEdges = currentEdges.map((e) => ({
		...e,
		data: { ...e.data!, dimmed: dimRelated(e.source) || dimRelated(e.target) },
	}));
	return { nodes: nextNodes, edges: nextEdges };
}
//#endregion

//#region PUBLIC ACTIONS
export function refreshNodesData(tasks: Task[]) {
	allTasks.set(tasks);
	taskById.clear();
	for (const t of tasks) taskById.set(t.id, t);

	const currentNodes = get(nodes);
	const currentEdges = get(edges);

	// update node.data from taskById
	const updatedNodes = currentNodes.map((n) => {
		const t = taskById.get(n.id);
		return t ? { ...n, data: { task: t } } : n;
	});

	// reapply dimming with existing edges
	const decorated = decorateDimming(updatedNodes, currentEdges);
	nodes.set(decorated.nodes);
}

export async function updateGraph(useLayout: boolean) {
	const all = get(allTasks);
	const f = get(filteredIds);
	const visibleIds = buildVisibleIdSet();
	const tasksForLayout = selectTasksForLayout(all, visibleIds);

	let baseNodes: WFNode[];
	let baseEdges: WFEdge[];

	if (useLayout) {
		const laidOut = await elkLayoutEngine(tasksForLayout, { direction: 'RIGHT' });
		baseNodes = laidOut.nodes.map((n) => {
			const t = taskById.get(n.id);
			return t ? { ...n, data: { task: t } } : n;
		});
		baseEdges = laidOut.edges;
	} else {
		const prevNodes = get(nodes);
		const prevEdges = get(edges);
		if (prevNodes.length > 0) {
			baseNodes = prevNodes.map((n) => {
				const t = taskById.get(n.id);
				return t ? { ...n, data: { task: t } } : n;
			});
			baseEdges = prevEdges;
		} else {
			const laidOut = await elkLayoutEngine(tasksForLayout, { direction: 'RIGHT' });
			baseNodes = laidOut.nodes.map((n) => {
				const t = taskById.get(n.id);
				return t ? { ...n, data: { task: t } } : n;
			});
			baseEdges = laidOut.edges;
		}
	}

	const decorated = decorateDimming(baseNodes, baseEdges);
	nodes.set(decorated.nodes);
	edges.set(decorated.edges);
}
//#endregion