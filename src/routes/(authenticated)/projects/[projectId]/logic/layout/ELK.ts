//#region IMPORTS
import { isTaskCompleted, type Task } from '$domain/models/task';
// @ts-ignore
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { LayoutEngine } from './LayoutEngine';
import { viewNodes, getEdgeKey } from '../shared-state';
import { settings } from '$lib/config/user-settings';
import { get } from 'svelte/store';
//#endregion

//#region CONSTANTS
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 60;
const MIN_NODE_WIDTH = 100;
const MIN_NODE_HEIGHT = 40;
//#endregion

//#region ALGORITHM PRESETS
export type ElkAlgorithm = 'Layered' | 'Stress';

const LAYERED_OPTIONS: Record<string, string> = {
	'elk.algorithm': 'layered',
	'elk.direction': 'RIGHT',
	'elk.layered.spacing.nodeNodeBetweenLayers': '150',
	'elk.spacing.nodeNode': '40',
	'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS',
	'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.layered.crossingMinimization.semiInteractive': 'false',
	'elk.layered.cycleBreaking.strategy': 'GREEDY',
	'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
	'elk.layered.compaction.connectedComponents': 'true',
	'elk.layered.spacing.edgeNodeBetweenLayers': '20',
	'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
	'elk.edgeRouting': 'ORTHOGONAL',
	'elk.layered.thoroughness': '10',
	'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
};

const STRESS_OPTIONS: Record<string, string> = {
	'elk.algorithm': 'stress',
	'elk.spacing.nodeNode': '80',
	'elk.stress.desiredEdgeLength': '150',
	'elk.stress.epsilon': '0.001',
	'elk.stress.iterationLimit': '300',
};

const algorithmSetting = settings.graph.layout.algorithm;
//#endregion

//#region MAIN
export class ElkLayoutEngine implements LayoutEngine {
	private elk: InstanceType<typeof ELK>;
	private pendingLayout: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		this.elk = new ELK();
	}

	/** Triggers layout computation. If delay is provided, debounces multiple calls. */
	start(delay?: number): void {
		if (this.pendingLayout) {
			clearTimeout(this.pendingLayout);
			this.pendingLayout = null;
		}

		if (delay && delay > 0) {
			this.pendingLayout = setTimeout(() => {
				this.pendingLayout = null;
				this.computeLayout();
			}, delay);
		} else {
			this.computeLayout();
		}
	}

	/** Cancels any pending layout computation. */
	stop(): void {
		if (this.pendingLayout) {
			clearTimeout(this.pendingLayout);
			this.pendingLayout = null;
		}
	}

	/** Track dragged node position. */
	onNodeDragged(id: string, position: { x: number; y: number }): void {
		const node = viewNodes.get(id);
		if (!node) return;
		node.position.x = position.x;
		node.position.y = position.y;
		node.dragging = true;
		viewNodes.set(id, node);
	}

	/** Update position after drag ends. */
	onNodeDragEnd(id: string, position: { x: number; y: number }): void {
		const node = viewNodes.get(id);
		if (!node) return;
		node.position.x = position.x;
		node.position.y = position.y;
		node.dragging = false;
		viewNodes.set(id, node);
	}

	destroy(): void {
		this.stop();
	}

	private async computeLayout(): Promise<void> {
		const viewNodeData = Array.from(viewNodes.values());
		if (viewNodeData.length === 0) return;

		const algorithm = get(algorithmSetting) as ElkAlgorithm;
		const isStress = algorithm === 'Stress';

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
			const nodeOpts: Record<string, string> = {};

			// For stress algorithm, pinned nodes are truly fixed
			if (isStress && n.data.pinned) {
				nodeOpts['org.eclipse.elk.stress.fixed'] = 'true';
			}

			return {
				id: n.id,
				width: size.width,
				height: size.height,
				// Always provide positions (needed for interactive layered + stress fixed)
				x: n.position.x,
				y: n.position.y,
				...(Object.keys(nodeOpts).length > 0 && { layoutOptions: nodeOpts }),
			};
		});

		// Build edges from viewNodes relationships
		const nodes = new Set<string>(elkNodes.map(n => n.id));
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

		const layoutOptions = isStress ? STRESS_OPTIONS : LAYERED_OPTIONS;

		const elkGraph = {
			id: 'root',
			layoutOptions,
			children: elkNodes,
			edges: elkEdges,
		} satisfies ElkNode;

		const laidOut = await this.elk.layout(elkGraph);

		// Write positions directly to viewNodes (skip pinned nodes)
		for (const elkNode of laidOut.children || []) {
			const id = String(elkNode.id);
			const viewNode = viewNodes.get(id);
			if (!viewNode || viewNode.data.pinned) continue;

			viewNode.position.x = elkNode.x ?? 0;
			viewNode.position.y = elkNode.y ?? 0;
			viewNodes.set(id, viewNode);
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