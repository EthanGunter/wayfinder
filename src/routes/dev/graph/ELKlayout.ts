import type { Edge, Node } from '@xyflow/svelte';
import ELK from 'elkjs/lib/elk.bundled.js';

export type ElkLayoutOptions = Record<string, string | number | boolean>;

export type NodeDefaultSize = { width: number; height: number };

const elk = new ELK();

export async function runElkLayout(
  nodes: Node[],
  edges: Edge[],
  layoutOptions: ElkLayoutOptions,
  defaultNodeSize: NodeDefaultSize
): Promise<Node[]> {
  const graph = {
    id: 'root',
    layoutOptions,
    children: nodes.map((n) => ({
      id: n.id,
      width: (n as any).width ?? defaultNodeSize.width,
      height: (n as any).height ?? defaultNodeSize.height
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }))
  } as const;

  const result = await elk.layout(graph as any);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const child of result.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }

  return nodes.map((n) => {
    const pos = positions[n.id];
    return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
  });
}


