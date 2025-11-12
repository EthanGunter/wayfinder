import type { Task } from '$domain/models/task';
import type { Node as _n, Edge as _e } from '@xyflow/svelte';

export type FlowData<T extends Task = Task> = { task: T, dimmed?: boolean } & Record<string, unknown>;
export type WFNode<T extends Task = Task> = _n<FlowData<T>, string | undefined>;
export type WFEdge<T extends Task = Task> = _e<FlowData<T>, string | undefined>;