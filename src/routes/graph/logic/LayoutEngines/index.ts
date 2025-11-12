//#region TYPES
import type { WFEdge, WFNode } from '../../types';
import type { Task } from '$domain/models/task';
import { layoutTasksWithElk } from './ELK';

export type LayoutOptions = {
	direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
};

export type LayoutEngine = (
	tasks: Task[],
	options?: LayoutOptions
) => Promise<{ nodes: WFNode[]; edges: WFEdge[] }>;
//#endregion

//#region ADAPTER
export const elkLayoutEngine: LayoutEngine = async (tasks, options) => {
	const direction = options?.direction ?? 'RIGHT';
	return layoutTasksWithElk(tasks, { direction });
};
//#endregion