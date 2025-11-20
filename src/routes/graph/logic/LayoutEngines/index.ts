//#region TYPES
import type { FlowEdge, FlowNode } from '../../types';
import type { Task } from '$domain/models/task';
import { layoutTasksWithElk } from './ELK';

export type LayoutOptions = {
	direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
};

export type LayoutEngine = (
	tasks: Task[],
	options?: LayoutOptions
) => Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }>;
//#endregion

//#region ADAPTER
export const elkLayoutEngine: LayoutEngine = async (tasks, options) => {
	const direction = options?.direction ?? 'RIGHT';
	return layoutTasksWithElk(tasks, { direction });
};
//#endregion