import type { AppNode, IAppNode } from '$domain/models/node';
import type { Task } from '$domain/models/task';
import type { Node as _n, Edge as _e } from '@xyflow/svelte';

export type FlowData<T extends AppNode<unknown> = Task> = { wfNode: T, dimmed?: boolean } & Record<string, unknown>;
export type FlowNode<T extends AppNode<unknown> = Task> = _n<FlowData<T>, string | undefined>;
export type FlowEdge<T extends AppNode<unknown> = Task> = _e<FlowData<T>, string | undefined>;