import type { WFEdge, WFNode } from '../types';
import type { Task } from '$domain/models/task';
import { layoutTasksWithElk } from './layoutEngine';

export type LayoutOptions = {
	direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
};

export type LayoutEngine = (
	tasks: Task[],
	options?: LayoutOptions
) => Promise<{ nodes: WFNode[]; edges: WFEdge[] }>;

// Adapter around current ELK layout. Hot-swappable seam.
export const elkLayoutEngine: LayoutEngine = async (tasks, options) => {
	const direction = options?.direction ?? 'RIGHT';
	return layoutTasksWithElk(tasks, { direction });
};