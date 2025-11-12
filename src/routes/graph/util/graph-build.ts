import type { Task } from '$domain/models/task';
import type { WFEdge, WFNode } from '../types';
import type { LayoutEngine, LayoutOptions } from './layout';
import { refreshNodeData } from './graphNodeHandlers';
import { filterTasksForLayout, applyVisibilityToGraph } from './appearance';

export async function buildGraph(params: {
  allTasks: Task[];
  taskById: Map<string, Task>;
  previous: { nodes: WFNode[]; edges: WFEdge[] } | null;
  filter: { matching: Set<string>; related: Set<string> } | null;
  layoutEngine: LayoutEngine;
  layoutOptions?: LayoutOptions;
  useLayout: boolean;
}): Promise<{ nodes: WFNode[]; edges: WFEdge[] }> {
  const {
    allTasks,
    taskById,
    previous,
    filter,
    layoutEngine,
    layoutOptions,
    useLayout,
  } = params;

  const tasksForLayout = filterTasksForLayout(allTasks, filter);

  let baseNodes: WFNode[];
  let baseEdges: WFEdge[];

  if (useLayout) {
    const laidOut = await layoutEngine(tasksForLayout, layoutOptions);
    baseNodes = laidOut.nodes;
    baseEdges = laidOut.edges;
  } else if (previous) {
    baseNodes = previous.nodes;
    baseEdges = previous.edges;
  } else {
    const laidOut = await layoutEngine(tasksForLayout, layoutOptions);
    baseNodes = laidOut.nodes;
    baseEdges = laidOut.edges;
  }

  const nodesWithFreshData = refreshNodeData(baseNodes, taskById);
  const decorated = applyVisibilityToGraph(nodesWithFreshData, baseEdges, filter);
  return decorated;
}