import type { Node as FlowNode, Edge as FlowEdge } from '@xyflow/svelte';
import type { AppNode } from '$domain/models/node';

// Forward-declare types to avoid circular dependency
export type ViewNodeData<T extends AppNode = AppNode> = {
	appNode: T,
	dimmed?: boolean,
	pinned?: boolean,  // TODO: sync to DB
	collapsedChildren?: boolean,
} & Record<string, unknown>;
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

export interface LayoutEngine {
	/** Start layout computation. */
	start(prewarm?: number): void;

	/** Stop layout computation. */
	stop(): void;

	/** Called when UI/user drags a node. */
	onNodeDragged(id: string, position: { x: number; y: number }): void;
	onNodeDragEnd(id: string, position: { x: number; y: number }): void;

	destroy(): void;
}


//#region Utilities

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

//#endregion