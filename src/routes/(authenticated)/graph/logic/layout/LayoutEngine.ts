import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/svelte';
import type { AppNode } from '$domain/models/node';
import { getEdgeKey } from '../shared-state';

// Forward-declare types to avoid circular dependency
export type ViewNodeData<T extends AppNode = AppNode> = { appNode: T, dimmed?: boolean } & Record<string, unknown>;
export type ViewEdgeData = { dimmed?: boolean } & Record<string, unknown>;

export interface ViewNode extends FlowNode {
	id: string;
	type: string;
	position: {
		x: number;
		y: number;
	};
	data: ViewNodeData;
}
export interface ViewEdge extends FlowEdge { }

export interface LayoutNode {
	id: string;
	type: string;
	x: number;
	y: number;

	width?: number;
	height?: number;

	fixed: boolean; // user is currently dragging/locked
}

export interface LayoutEngine {
	/** Start continuous simulation (if applicable). */
	start(prewarm?: number): void;

	/** Stop / pause simulation. */
	stop(): void;

	/** Called when UI/user fixes or moves a particular node. */
	onNodeDragged(id: string, pos: LayoutNode): void;
	onNodeDragEnd(id: string, pos: LayoutNode): void;

	destroy(): void;
}


//#region Utilities

export function getEdgesFromAppNode(e: AppNode): ViewEdge[] {
	const edges: ViewEdge[] = [];
	e.parents.forEach(p => {
		edges.push({
			id: getEdgeKey(p, e.id),
			source: p,
			target: e.id,
			type: e.data.type
		})
	})
	e.children.forEach(c => {
		edges.push({
			id: getEdgeKey(e.id, c),
			source: e.id,
			target: c,
			type: e.data.type
		})
	})
	return edges;
}

export function appToView(n: AppNode, existing?: ViewNode): ViewNode {
	if (!existing) return {
		id: n.id,
		type: n.data.type,
		position: { x: 0, y: 0 },
		data: { appNode: n }
	}

	return {
		...existing,
		id: n.id,
		data: { appNode: n }
	};
}

export function viewToLayout(n: ViewNode): LayoutNode {
	return {
		id: n.id,
		type: n.type,
		x: n.position.x,
		y: n.position.y,
		width: n.width ?? 0,
		height: n.height ?? 0,
		fixed: n.dragging ?? false,
	}
}

//#endregion