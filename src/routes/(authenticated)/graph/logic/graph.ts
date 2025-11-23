//#region IMPORTS
import type { FlowEdge, FlowNode } from '../types';
import type { Task } from '$domain/models/task';
import { get } from 'svelte/store';
import { elkLayoutEngine } from './LayoutEngines';
import { allTasks, taskById, nodes, edges } from './shared-state';
import { filteredIds } from './search';
import { pendingNodeParams, type PendingNodeIntent } from './ui-state';
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
	currentNodes: FlowNode[],
	currentEdges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
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
	// 1) keep global maps up to date
	allTasks.set(tasks);
	taskById.clear();
	for (const t of tasks) taskById.set(t.id, t);

	// 2) start from current graph state
	const currentNodes = get(nodes);
	const currentEdges = get(edges);

	// 3) rehydrate data for existing nodes; collect IDs to detect new tasks
	const knownIds = new Set(currentNodes.map((n) => n.id));
	let updatedNodes: FlowNode[] = currentNodes.map((n) => {
		const t = taskById.get(n.id);
		return t ? { ...n, data: { wfNode: t } } : n;
	});

	// 4) add missing nodes (brand-new tasks) with placeholder position (0,0)
	const newNodes: FlowNode[] = tasks
		.filter((t) => !knownIds.has(t.id))
		.map((t) => ({
			id: t.id,
			type: 'task',
			data: { wfNode: t },
			position: { x: 0, y: 0 },
			x: 0,
			y: 0,
		}));

	updatedNodes = [...updatedNodes, ...newNodes];

	// 4.5) filter out nodes for deleted tasks
	updatedNodes = updatedNodes.filter((n) => taskById.get(n.id) !== undefined);

	// 5) generate edges for all nodes based on their current Task relations
	//    - id: `e-${start}-${end}`
	//    - for parent edges: source = parentId, target = node.id
	//    - for child edges: source = node.id, target = childId
	// We'll generate both directions but avoid duplicates with a Set.
	const existingEdgeIds = new Set(currentEdges.map((e) => e.id));
	const generatedEdges: FlowEdge[] = [];

	for (const n of updatedNodes) {
		const t = n.data.wfNode;
		if (!t) continue;

		// parents => edges parent -> node
		for (const parentId of t.parents) {
			if (!parentId) continue;
			const key = `e-${parentId}-${t.id}`;
			if (!existingEdgeIds.has(key)) {
				generatedEdges.push({
					id: key,
					source: parentId,
					target: t.id,
					type: 'task',
					data: { wfNode: t },
				} satisfies FlowEdge);
				existingEdgeIds.add(key);
			}
		}

		// children => edges node -> child
		for (const childId of t.children) {
			if (!childId) continue;
			const key = `e-${t.id}-${childId}`;
			if (!existingEdgeIds.has(key)) {
				generatedEdges.push({
					id: key,
					source: t.id,
					target: childId,
					type: 'task',
					data: { wfNode: t },
				} satisfies FlowEdge);
				existingEdgeIds.add(key);
			}
		}
	}

	// 6) apply pending position once (if any), to updatedNodes (the array we will set)
	const pending: PendingNodeIntent = get(pendingNodeParams);
	if (pending?.pos) {
		// Choose a node to apply:
		// - Prefer pending.id if present
		// - Else, if there is exactly one truly new node, use that (common case right after create)
		let targetId: string | undefined = pending.id;

		if (!targetId) {
			const trulyNewIds = newNodes.map((nn) => nn.id);
			if (trulyNewIds.length === 1) {
				targetId = trulyNewIds[0];
			}
		}

		if (targetId) {
			const idx = updatedNodes.findIndex((n) => n.id === targetId);
			if (idx >= 0) {
				const n = updatedNodes[idx];
				updatedNodes = [
					...updatedNodes.slice(0, idx),
					{
						...n,
						position: { x: pending.pos.x, y: pending.pos.y }
					},
					...updatedNodes.slice(idx + 1),
				];
				// one-shot consume
				pendingNodeParams.set({});
			}
		}
	}

	// 7) build set of valid edge keys from current task relationships
	const validEdgeKeys = new Set<string>();
	const validNodeIds = new Set(updatedNodes.map((n) => n.id));

	for (const t of tasks) {
		// parents => edges parent -> task
		for (const parentId of t.parents) {
			if (!parentId) continue;
			validEdgeKeys.add(`e-${parentId}-${t.id}`);
		}
		// children => edges task -> child
		for (const childId of t.children) {
			if (!childId) continue;
			validEdgeKeys.add(`e-${t.id}-${childId}`);
		}
	}

	// 8) finalize edges: merge current + generated, filter to valid relationships, then dim and set
	const mergedEdges = [...currentEdges, ...generatedEdges].filter((e) => {
		const edgeKey = `e-${e.source}-${e.target}`;
		return (
			validEdgeKeys.has(edgeKey) &&
			validNodeIds.has(e.source) &&
			validNodeIds.has(e.target)
		);
	});

	const decorated = decorateDimming(updatedNodes, mergedEdges);
	nodes.set(decorated.nodes);
	edges.set(decorated.edges);
}

export async function updateGraph(useLayout: boolean) {
	const all = get(allTasks);
	const visibleIds = buildVisibleIdSet();
	const tasksForLayout = selectTasksForLayout(all, visibleIds);

	let baseNodes: FlowNode[];
	let baseEdges: FlowEdge[];

	if (useLayout) {
		const laidOut = await elkLayoutEngine(tasksForLayout, { direction: 'RIGHT' });
		baseNodes = laidOut.nodes.map((n) => {
			const t = taskById.get(n.id);
			return t ? { ...n, data: { wfNode: t } } : n;
		});
		baseEdges = laidOut.edges;
	} else {
		const prevNodes = get(nodes);
		const prevEdges = get(edges);
		if (prevNodes.length > 0) {
			baseNodes = prevNodes.map((n) => {
				const t = taskById.get(n.id);
				return t ? { ...n, data: { wfNode: t } } : n;
			});
			baseEdges = prevEdges;
		} else {
			const laidOut = await elkLayoutEngine(tasksForLayout, { direction: 'RIGHT' });
			baseNodes = laidOut.nodes.map((n) => {
				const t = taskById.get(n.id);
				return t ? { ...n, data: { wfNode: t } } : n;
			});
			baseEdges = laidOut.edges;
		}
	}

	const decorated = decorateDimming(baseNodes, baseEdges);
	nodes.set(decorated.nodes);
	edges.set(decorated.edges);
}
//#endregion