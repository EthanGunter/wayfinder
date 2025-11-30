// layoutEngine.ts
import { forceSimulation, forceX, forceY, forceCollide, type SimulationNodeDatum, type SimulationLinkDatum, type ForceLink, type Simulation, forceLink, forceManyBody, forceCenter, type Force } from 'd3-force';
import { type LayoutEngine, type LayoutNode, type ViewNode } from './LayoutEngine';
import { getEdgeKey, layoutPositions, viewEdges, viewNodes } from '../shared-state';

const MAX_FPS = 60;

export type LayoutOptions = {
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
};

export type ForceRule = {
  name: string;
  enabled: boolean;
  force: any; // d3 force
  params: Record<string, any>;
};

type SimNode = SimulationNodeDatum & Omit<LayoutNode, 'fixed'>;
type SimLink = SimulationLinkDatum<SimNode>;

const MIN_UPDATE_DELTA = .01;
export class ForceLayoutEngine implements LayoutEngine {
  private rules: Map<string, ForceRule> = new Map();
  private simulation: Simulation<SimNode, SimLink>;
  private msPerFrame: number;

  // d3's internal state - Maps for O(1) surgical updates
  private simNodes: Map<string, SimNode> = new Map();
  private simLinks: Map<string, SimLink> = new Map();
  private animationFrameId: number | null = null;
  private isRunning = false;
  private unsubscribeViewNodes: (() => void) | null = null;
  private unsubscribeViewEdges: (() => void) | null = null;
  // Cache last written positions to avoid creating new objects when unchanged
  private lastWrittenPositions: Map<string, LayoutNode> = new Map();
  private lastFrameTime: number = 0;

  constructor() {
    this.msPerFrame = 1000 / MAX_FPS;

    // Subscribe to viewNodes changes - handle surgical updates
    // Only react to layout-relevant fields: width, height, type, relationships
    // Ignore position changes (that's what we output!), dragging state, selection, etc.
    this.unsubscribeViewNodes = viewNodes.subscribe(({ key, value, op }) => {
      if (op === 'delete') {
        this.simNodes.delete(key);
        // Remove all edges connected to this node
        for (const [edgeId, edge] of this.simLinks) {
          if (edge.source === key || edge.target === key) {
            this.simLinks.delete(edgeId);
          }
        }
        this.updateSimulationState();
      } else if (op === 'add') {
        // New node - always add
        const newNode = this.createSimNode(value!);
        if (!newNode) return;

        this.simNodes.set(key, newNode);

        // Only create edges if BOTH nodes exist
        if (value!.data.appNode.parents) {
          for (const parentId of value!.data.appNode.parents) {
            if (this.simNodes.has(parentId)) {
              const edgeId = getEdgeKey(parentId, key);
              this.simLinks.set(edgeId, { source: parentId, target: key });
            }
          }
        }
        if (value!.data.appNode.children) {
          for (const childId of value!.data.appNode.children) {
            if (this.simNodes.has(childId)) {
              const edgeId = getEdgeKey(key, childId);
              this.simLinks.set(edgeId, { source: key, target: childId });
            }
          }
        }

        this.updateSimulationState();
      } else if (op === 'set') {
        // Update - only trigger if layout-relevant fields changed
        const existingNode = this.simNodes.get(key);
        if (!existingNode) return; // Node doesn't exist yet, shouldn't happen

        const newWidth = value!.width ?? 0;
        const newHeight = value!.height ?? 0;
        const newType = value!.type;

        // Check if layout-relevant fields changed
        const widthChanged = existingNode.width !== newWidth;
        const heightChanged = existingNode.height !== newHeight;
        const typeChanged = existingNode.type !== newType;

        if (widthChanged || heightChanged || typeChanged) {
          // Update dimensions/type
          existingNode.width = newWidth;
          existingNode.height = newHeight;
          existingNode.type = newType;

          // Reheat slightly since collision radius may have changed
          this.simulation.alpha(Math.min(0.3, this.simulation.alpha() + 0.1)).restart();
          this.ensureAnimationLoop();
        }

        // Note: We don't handle relationship changes here - those are managed by
        // the edge recalculation in shared-state.ts and don't need simulation restart
      }
    });

    // Remove edges subscription entirely

    this.simulation = forceSimulation<SimNode>()
      .force('repulse', forceManyBody().strength(-100))
      .force('link', forceLink().id((d: any) => d.id).distance(150).strength(1))
      .force('collision', forceCollide().radius(80))
      .force('center', forceCenter())
  }


  //#region PRIVATE HELPERS

  /**
   * Convert ViewNode to d3 SimNode, preserving existing simulation state if available
   * @returns null if the changed fields are not relevant to the simulation
   */
  private createSimNode(viewNode: ViewNode, existingNode?: SimNode): SimNode | null {
    const layoutPos = existingNode
      ? { x: existingNode.x ?? 0, y: existingNode.y ?? 0 }
      : { x: viewNode.position.x, y: viewNode.position.y };

    return {
      // ...viewNode.data.appNode,
      id: viewNode.id,
      type: viewNode.type,
      x: layoutPos.x,
      y: layoutPos.y,
      width: viewNode.width ?? 0,
      height: viewNode.height ?? 0,
      // Use fx/fy to pin nodes when fixed flag is set (d3 won't move pinned nodes)
      fx: viewNode.dragging ? layoutPos.x : undefined,
      fy: viewNode.dragging ? layoutPos.y : undefined,
      // Preserve d3's velocity state if node already exists
      vx: existingNode?.vx,
      vy: existingNode?.vy,
    } satisfies SimNode;
  }

  /**
   * Restart animation loop if it's stopped but simulation is running
   */
  private ensureAnimationLoop(): void {
    if (this.isRunning && this.animationFrameId === null) {
      this.startAnimationLoop();
    }
  }

  /**
   * Update d3 simulation with current node state (after structural changes)
   */
  private updateSimulationState(): void {
    // Convert Map to array for d3
    const nodesArray = Array.from(this.simNodes.values());
    this.simulation.nodes(nodesArray);

    // Reheat simulation to settle new structure
    this.simulation.alpha(0.5).restart();

    const linkForce = this.simulation.force('link') as ForceLink<SimNode, SimLink> | null;
    if (linkForce) {
      const linksArray = Array.from(this.simLinks.values()).map(link => ({ ...link }));
      linkForce.links(linksArray);
    }

    // Restart animation loop if needed
    this.ensureAnimationLoop();
  }

  /**
   * Update d3 link force with current links (after structural changes)
   */
  private updateSimulationLinks(): void {

  }

  //#endregion


  //#region LAYOUT ENGINE METHODS

  start(prewarm?: number): void {
    console.log('start');
    if (this.isRunning) return;
    this.isRunning = true;

    if (prewarm) {
      this.simulation.tick(prewarm);
      this.simulation.alpha(1);
    }

    this.simulation.restart();
    this.startAnimationLoop();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    this.simulation.stop();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.unsubscribeViewNodes?.();
    this.unsubscribeViewEdges?.();
    this.rules.clear();
    this.lastWrittenPositions.clear();
  }

  onNodeDragged(id: string, pos: LayoutNode): void {
    const node = this.simNodes.get(id);
    if (node) {
      // Update node position and pin it
      node.fx = pos.x;
      node.fy = pos.y;
      // Zero out velocity so it doesn't drift when unpinned
      node.vx = 0;
      node.vy = 0;
      layoutPositions.set(id, { ...pos, fixed: true })
    }

    this.simulation.alpha(0.5).restart();
    this.ensureAnimationLoop();
  }
  onNodeDragEnd(id: string, pos: LayoutNode): void {
    const node = this.simNodes.get(id);
    if (node) {
      node.fx = undefined;
      node.fy = undefined;
      node.vx = 0;
      node.vy = 0;

      layoutPositions.set(id, { ...pos, fixed: false })
    }

    this.simulation.alpha(0.5).restart();
    this.ensureAnimationLoop();
  }

  //#endregion


  private startAnimationLoop(): void {
    const tick = (currentTime: number) => {
      if (!this.isRunning) {
        this.animationFrameId = null;
        return;
      }

      if (this.simulation.alpha() <= this.simulation.alphaMin()) {
        this.animationFrameId = null;
        return;
      }

      // FPS limiting: only update if enough time has passed
      const timeDelta = currentTime - this.lastFrameTime;
      if (timeDelta < this.msPerFrame) {
        this.animationFrameId = requestAnimationFrame(tick);
        return;
      }

      this.lastFrameTime = currentTime;

      for (const [id, node] of this.simNodes) {
        if (node.x === undefined || node.y === undefined) continue;

        const viewNode = viewNodes.get(id);
        if (!viewNode || viewNode.dragging) continue;

        const fixed = node.fx !== undefined && node.fy !== undefined;
        const lastWritten = this.lastWrittenPositions.get(id);

        // CHECK CACHE FIRST - compare against last write, not viewNode
        if (lastWritten) {
          const dx = Math.abs(node.x - lastWritten.x);
          const dy = Math.abs(node.y - lastWritten.y);

          if (dx < MIN_UPDATE_DELTA &&
            dy < MIN_UPDATE_DELTA &&
            lastWritten.fixed === fixed &&
            lastWritten.width === node.width &&
            lastWritten.height === node.height) {
            continue; // Nothing changed since last write
          }
        }

        const positionUpdate: LayoutNode = {
          id: viewNode.id,
          type: viewNode.type,
          x: node.x,
          y: node.y,
          fixed,
          height: node.height,
          width: node.width,
        };

        this.lastWrittenPositions.set(id, positionUpdate);
        layoutPositions.set(id, positionUpdate);
      }


      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(tick);
      } else {
        this.animationFrameId = null;
      }
    }

    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(tick);
  }
}