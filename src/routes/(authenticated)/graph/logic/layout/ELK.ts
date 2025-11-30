//#region IMPORTS
import { isTaskCompleted, type Task } from '$domain/models/task';
// @ts-ignore
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { LayoutEngine, LayoutNode } from './LayoutEngine';
import { viewNodes, layoutPositions, getEdgeKey } from '../shared-state';
//#endregion

//#region CONSTANTS
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 60;
const MIN_NODE_WIDTH = 100;
const MIN_NODE_HEIGHT = 40;
//#endregion

//#region MAIN
export class ElkLayoutEngine implements LayoutEngine {
	private elk: InstanceType<typeof ELK>;
	private direction: 'DOWN' | 'RIGHT' | 'UP' | 'LEFT';

	constructor() {
		this.elk = new ELK();
		this.direction = 'RIGHT';
	}

	/** Triggers a one-time layout computation. */
	start(): void {
		this.computeLayout();
	}

	/** No-op for ELK (nothing continuously running). */
	stop(): void {
		// ELK doesn't run continuously, nothing to stop
	}

	/** Track dragged node position (for potential future re-layouts). */
	onNodeDragged(id: string, pos: LayoutNode): void {
		layoutPositions.set(id, { ...pos, fixed: true });
	}

	/** Update position after drag ends. */
	onNodeDragEnd(id: string, pos: LayoutNode): void {
		layoutPositions.set(id, { ...pos, fixed: false });
	}

	destroy(): void {
		// Nothing to clean up for triggered layout
	}

	private async computeLayout(): Promise<void> {
		const viewNodeData = Array.from(viewNodes.values());
		if (viewNodeData.length === 0) return;

		// Measure node sizes from DOM or use defaults
		const tasks = viewNodeData
			.map(n => n.data.appNode)
			.filter((n): n is Task => n !== undefined && 'data' in n);

		const measured = measureTaskNodeSizes(tasks) ?? new Map<string, { width: number; height: number }>();

		const getSize = (id: string) => {
			const viewNode = viewNodes.get(id);
			// Prefer actual rendered size if available
			if (viewNode?.width && viewNode?.height) {
				return { width: viewNode.width, height: viewNode.height };
			}
			return measured.get(id) ?? { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
		};

		const elkNodes = viewNodeData.map((n) => {
			const size = getSize(n.id);
			return { id: n.id, /* width: size.width, height: size.height */ };
		});

		// Build edges from viewNodes relationships
		const nodes = new Set<string>(elkNodes.map(n => n.id))
		const seen = new Set<string>();
		const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
		for (const node of viewNodeData) {
			const appNode = node.data.appNode;
			if (!appNode || !('children' in appNode)) continue;
			for (const childId of appNode.children) {
				if (!viewNodes.has(childId)) continue;
				const key = node.id + '->' + childId;
				if (seen.has(key)) continue;
				seen.add(key);

				// Don't create edges to nodes that aren't in the layout
				if (!nodes.has(childId)) continue;
				elkEdges.push({
					id: getEdgeKey(node.id, childId),
					sources: [node.id],
					targets: [childId]
				});
			}
		}

		const elkGraph = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': this.direction,
				'elk.layered.spacing.nodeNodeBetweenLayers': this.direction === 'RIGHT' ? "150" : "80",
				'elk.spacing.nodeNode': "40",
				'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
				'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
				'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
				'elk.layered.crossingMinimization.semiInteractive': "false",
				'elk.layered.cycleBreaking.strategy': 'GREEDY',
				'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
				'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
				'elk.layered.compaction.connectedComponents': "true",
				'elk.layered.spacing.edgeNodeBetweenLayers': "20",
				'elk.layered.spacing.edgeEdgeBetweenLayers': "10",
				'elk.edgeRouting': 'ORTHOGONAL',
				'elk.layered.thoroughness': "10",
			},
			children: elkNodes,
			edges: elkEdges,
		} satisfies ElkNode;

		const laidOut = await this.elk.layout(elkGraph);

		// Write positions to layoutPositions store
		for (const elkNode of laidOut.children || []) {
			const id = String(elkNode.id);
			const viewNode = viewNodes.get(id);
			if (!viewNode) continue;

			const size = getSize(id);
			const position: LayoutNode = {
				id,
				type: viewNode.type,
				x: elkNode.x ?? 0,
				y: elkNode.y ?? 0,
				// width: size.width,
				// height: size.height,
				fixed: false,
			};
			layoutPositions.set(id, position);
		}
	}
}

export default ElkLayoutEngine;
//#endregion

//#region SIZING
function measureTaskNodeSizes(
	tasks: Task[]
): Map<string, { width: number; height: number }> | null {
	if (typeof document === 'undefined') return null;
	try {
		const container = getOrCreateMeasureContainer();
		const results = new Map<string, { width: number; height: number }>();
		for (const t of tasks) {
			const el = buildMeasureNode(t);
			container.appendChild(el);
			// force reflow
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			el.offsetWidth;
			const rect = el.getBoundingClientRect();
			let w = Math.ceil(rect.width);
			let h = Math.ceil(rect.height);
			if (!Number.isFinite(w) || w <= 0) w = DEFAULT_NODE_WIDTH;
			if (!Number.isFinite(h) || h <= 0) h = DEFAULT_NODE_HEIGHT;
			w = Math.max(MIN_NODE_WIDTH, w);
			h = Math.max(MIN_NODE_HEIGHT, h);
			results.set(t.id, { width: w, height: h });
			container.removeChild(el);
		}
		return results;
	} catch {
		return null;
	}
}

function getOrCreateMeasureContainer(): HTMLElement {
	const id = '__wf_node_measure_container__';
	let container = document.getElementById(id);
	if (container) return container;
	container = document.createElement('div');
	container.id = id;
	container.style.position = 'absolute';
	container.style.left = '-10000px';
	container.style.top = '-10000px';
	container.style.overflow = 'visible';
	container.style.opacity = '0';
	container.style.pointerEvents = 'none';
	container.style.zIndex = '-1';
	document.body.appendChild(container);
	return container;
}

function buildMeasureNode(task: Task): HTMLElement {
	const root = document.createElement('div');
	root.className =
		'task-node group relative max-w-[280px]';
	root.style.display = 'inline-block';
	root.style.maxWidth = '280px';
	root.style.boxSizing = 'border-box';

	const inner = document.createElement('div');
	inner.className = 'flex items-start gap-2 px-3 py-2';

	const dotWrap = document.createElement('div');
	dotWrap.className = 'mt-0.5';
	const dot = document.createElement('div');
	dot.className = isTaskCompleted(task)
		? 'size-2 rounded-full bg-green-500'
		: 'size-2 rounded-full bg-gray-300';
	dotWrap.appendChild(dot);

	const contentWrap = document.createElement('div');
	contentWrap.className = 'min-w-0 flex-1';

	const title = document.createElement('div');
	title.className = 'truncate text-sm font-semibold text-gray-900';
	title.textContent = task.data.title ?? '';
	contentWrap.appendChild(title);

	if (task.data.content) {
		const body = document.createElement('div');
		body.className = 'mt-0.5 line-clamp-2 text-xs text-gray-600';
		body.textContent = task.data.content;
		contentWrap.appendChild(body);
	}

	inner.appendChild(dotWrap);
	inner.appendChild(contentWrap);
	root.appendChild(inner);
	return root;
}
//#endregion