import type { GraphNode, IGraphNode } from '$domain/models/node';
import type { Task } from '$domain/models/task';
import type { Node as _n, Edge as _e } from '@xyflow/svelte';

export type FlowData<T extends GraphNode<unknown> = Task> = { wfNode: T, dimmed?: boolean } & Record<string, unknown>;
export type FlowNode<T extends GraphNode<unknown> = Task> = _n<FlowData<T>, string | undefined>;
export type FlowEdge<T extends GraphNode<unknown> = Task> = _e<FlowData<T>, string | undefined>;