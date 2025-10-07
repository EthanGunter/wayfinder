import { isTaskCompleted, type Task } from '$domain/models/task';
import type { Node, Edge } from '@xyflow/svelte';
import { Position } from '@xyflow/svelte';

// Import ELK (bundled build works reliably with Vite)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 84;
const MIN_NODE_WIDTH = 100;
const MIN_NODE_HEIGHT = 0;

type LayoutOpts = {
    nodeWidth?: number;
    nodeHeight?: number;
    direction?: 'DOWN' | 'RIGHT' | 'UP' | 'LEFT';
};

export async function layoutTasksWithElk(
    tasks: Task[],
    opts: LayoutOpts = {}
): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const byId = new Map<string, Task>(tasks.map((t) => [t.id, t]));

    const nodeWidth = opts.nodeWidth ?? DEFAULT_NODE_WIDTH;
    const nodeHeight = opts.nodeHeight ?? DEFAULT_NODE_HEIGHT;
    const direction = opts.direction ?? 'DOWN';

    // Measure actual sizes in the browser (fallback to defaults on SSR)
    const measured = measureTaskNodeSizes(tasks) ?? new Map<string, { width: number; height: number }>();
    const getSize = (id: string) => measured.get(id) ?? { width: nodeWidth, height: nodeHeight };

    // Build ELK graph
    const elkNodes = tasks.map((t) => {
        const size = getSize(t.id);
        return {
            id: t.id,
            width: size.width,
            height: size.height
        };
    });

    const seen = new Set<string>();
    const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];
    for (const t of tasks) {
        const parentId = t.id;
        // Sort children by priority DESC so higher priority appears leftmost
        const childrenSorted = (t.children || [])
            .map((cid) => byId.get(cid))
            .filter((c): c is Task => Boolean(c))
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .map((c) => c.id);

        for (const childId of childrenSorted) {
            if (!byId.has(childId)) continue;
            const key = parentId + '->' + childId;
            if (seen.has(key)) continue;
            seen.add(key);
            elkEdges.push({ id: `e-${parentId}-${childId}`, sources: [parentId], targets: [childId] });
        }
    }

    const elkGraph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': direction,
            'elk.layered.spacing.nodeNodeBetweenLayers': 80, // increased vertical spacing
            'elk.spacing.nodeNode': 40, // increased horizontal spacing  
            'elk.layered.nodePlacement.strategy': 'LINEAR_SEGMENTS', // better for balanced layouts
            'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED', // balanced alignment
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP', // better crossing reduction
            'elk.layered.crossingMinimization.semiInteractive': false,
            'elk.layered.cycleBreaking.strategy': 'GREEDY', // handle cycles better
            'elk.layered.layering.strategy': 'NETWORK_SIMPLEX', // better layering
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', // respect input order for nodes/edges
            'elk.layered.compaction.connectedComponents': true, // compact connected components
            'elk.layered.spacing.edgeNodeBetweenLayers': 20, // space between edges and nodes
            'elk.layered.spacing.edgeEdgeBetweenLayers': 10, // space between parallel edges
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.thoroughness': 10, // increase thoroughness for better results
        },
        children: elkNodes,
        edges: elkEdges
    } as const;

    const laidOut = await elk.layout(elkGraph as any);

    // Map back to XYFlow nodes/edges
    const nodes: Node[] = (laidOut.children || []).map((n: any) => ({
        id: String(n.id),
        type: 'task',
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        width: n.width ?? nodeWidth,
        height: n.height ?? nodeHeight,
        // data is filled by caller after layout; keep minimal here
        data: {} as Record<string, unknown>,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
    }));

    const edges: Edge[] = elkEdges.map((e) => ({
        id: e.id,
        source: e.sources[0],
        target: e.targets[0],
        type: 'task'
    }));

    // Attach task data to nodes
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    for (const t of tasks) {
        const n = nodeMap.get(t.id);
        if (n) n.data = t as unknown as Record<string, unknown>;
    }

    return { nodes, edges };
}

export type { LayoutOpts };

// --- sizing helpers ---

function measureTaskNodeSizes(
    tasks: Task[]
): Map<string, { width: number; height: number }> | null {
    if (typeof document === 'undefined') return null;
    try {
        const container = getOrCreateMeasureContainer();
        const results = new Map<string, { width: number; height: number }>();
        for (const t of tasks) {
            const el = buildMeasureNode(t);
            container.appendChild(el);
            // Force layout
            // Force reflow before measuring
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            el.offsetWidth;
            const rect = el.getBoundingClientRect();
            let w = Math.ceil(rect.width);
            let h = Math.ceil(rect.height);
            if (!Number.isFinite(w) || w <= 0) w = DEFAULT_NODE_WIDTH;
            if (!Number.isFinite(h) || h <= 0) h = DEFAULT_NODE_HEIGHT;
            w = Math.max(MIN_NODE_WIDTH, w);
            h = Math.max(MIN_NODE_HEIGHT, h);
            results.set(t.id, { width: w, height: h });
            container.removeChild(el);
        }
        return results;
    } catch {
        return null;
    }
}

function getOrCreateMeasureContainer(): HTMLElement {
    const id = '__wf_node_measure_container__';
    let container = document.getElementById(id);
    if (container) return container;
    container = document.createElement('div');
    container.id = id;
    container.style.position = 'absolute';
    container.style.left = '-10000px';
    container.style.top = '-10000px';
    container.style.overflow = 'visible';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-1';
    document.body.appendChild(container);
    return container;
}

function buildMeasureNode(task: Task): HTMLElement {
    const root = document.createElement('div');
    root.className =
        'task-node group relative max-w-[280px] rounded-md border-1 border-gray-300 bg-white shadow-sm';
    root.style.display = 'inline-block';
    root.style.maxWidth = '280px';
    root.style.boxSizing = 'border-box';

    const inner = document.createElement('div');
    inner.className = 'flex items-start gap-2 px-3 py-2';

    const dotWrap = document.createElement('div');
    dotWrap.className = 'mt-0.5';
    const dot = document.createElement('div');
    dot.className = isTaskCompleted(task) ? 'size-2 rounded-full bg-green-500' : 'size-2 rounded-full bg-gray-300';
    dotWrap.appendChild(dot);

    const contentWrap = document.createElement('div');
    contentWrap.className = 'min-w-0 flex-1';

    const title = document.createElement('div');
    title.className = 'truncate text-sm font-semibold text-gray-900';
    title.textContent = task.title ?? '';
    contentWrap.appendChild(title);

    if (task.content) {
        const body = document.createElement('div');
        body.className = 'mt-0.5 line-clamp-2 text-xs text-gray-600';
        body.textContent = task.content;
        contentWrap.appendChild(body);
    }

    inner.appendChild(dotWrap);
    inner.appendChild(contentWrap);
    root.appendChild(inner);
    return root;
}


