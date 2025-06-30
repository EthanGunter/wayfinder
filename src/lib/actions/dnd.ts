/**
 * Simplified DnD Library
 * 
 * This library now uses a unified event-based system where all drag and drop
 * interactions are handled through custom events. The callback props (onDragStart,
 * onDrop, etc.) are now syntactic sugar that automatically manage event listeners.
 * 
 * Events:
 * - 'dnd-dragstart': Fired when a drag operation begins
 * - 'dnd-dragenter': Fired when a draggable enters a droppable
 * - 'dnd-dragover': Fired continuously while dragging over a droppable
 * - 'dnd-dragleave': Fired when a draggable leaves a droppable
 * - 'dnd-drop': Fired when a drop occurs (on both the droppable and draggable)
 * - 'dnd-dragover-render': Fired during drag for custom ghost positioning
 */

import "./dnd.scss"

// TODO: Make droppables stop event propagation
// TODO: Write tests for dnd.ts
// TODO: Add animation support for ghosts (spring back on failed drop) - Requires animation library integration
// TODO: Add animation support for original node (spring to new position on successful drop) - Requires animation library integration


//#region Types

// --- Event Name Constants ---
export const eventNames = {
  DRAGSTART: "dnd-dragstart",
  DRAGENTER: "dnd-dragenter",
  DRAGOVER: "dnd-dragover",
  DRAGLEAVE: "dnd-dragleave",
  DROP: "dnd-drop",
}

// --- CSS names
export const DRAGGABLE_CSS_CLASS = "dnd-draggable";
export const DROPPABLE_CSS_CLASS = "dnd-droppable";
const VALID_DROP_CLASS = "valid-drop";
const INVALID_DROP_CLASS = "invalid-drop";
const CONTROLS_DRAGGABLE_ATTR = "data-controls-draggable"; // Used by droppable to indicate it influences ghost rendering/position
const DROPPABLE_ACCEPTS_ATTR = "data-droppable-accepts";
const DRAG_GROUP_ID_ATTR = "data-drag-group-id"; // Marker for group boundaries

// --- Core Detail Interface ---
// Core data available during a drag operation
interface CoreDragData<T = any> {
  draggableType: string; // The type of the draggable
  data?: T; // The associated data payload
  initiatorNode: HTMLElement; // The original element the drag started on (always the one with the draggable action)
  node: HTMLElement; // The "conceptual" node being dragged (initiatorNode or groupNode)
  ghost: HTMLElement; // The ghost element
  clientX: number; // Current x-coordinate of the pointer
  clientY: number; // Current y-coordinate of the pointer
}

// Base Event Detail - currently, just extends CoreDragData
interface DndEventDetail<T = any> extends CoreDragData<T> { }
interface DropEventDetail<T = any> extends CoreDragData<T> { dropAllowed: boolean }
interface DragOverEventDetail<T = any> extends CoreDragData<T> {
  /** Positional data specific to the rendering context */
  posData: DragPositionData;
  /** The droppable being hovered */
  currentDroppableTarget: DroppableElement | null;
  /** Sets the position of the ghost node */
  setGhostPosition: ({ x, y }: { x?: number, y?: number }) => void;
}

// --- Base Custom Event Class ---
export class DndDragEvent<
  TData = any,
  TDetail extends DndEventDetail<TData> = DndEventDetail<TData>,
> extends CustomEvent<TDetail> {
  constructor(
    eventName: string,
    detail: TDetail,
    eventInitDict?: CustomEventInit<TDetail>
  ) {
    super(eventName, {
      detail,
      bubbles: true,
      composed: true,
      ...eventInitDict,
    });
  }
}

// --- Specific Event Classes ---
export class DragStartEvent<T = any> extends DndDragEvent<T, DndEventDetail<T>> {
  constructor(detail: DndEventDetail<T>) {
    super(eventNames.DRAGSTART, detail);
  }
}
export class DragEnterEvent<T = any> extends DndDragEvent<T, DndEventDetail<T>> {
  constructor(detail: DndEventDetail<T>) {
    super(eventNames.DRAGENTER, detail);
  }
}
export class DragOverEvent<T = any> extends DndDragEvent<T, DragOverEventDetail<T>> {
  constructor(detail: DragOverEventDetail<T>) {
    super(eventNames.DRAGOVER, detail);
  }
}
export class DragLeaveEvent<T = any> extends DndDragEvent<T, DndEventDetail<T>> {
  constructor(detail: DndEventDetail<T>) {
    super(eventNames.DRAGLEAVE, detail);
  }
}
export class DropEvent<T = any> extends DndDragEvent<T, DropEventDetail<T>> {
  constructor(detail: DropEventDetail<T>) {
    super(eventNames.DROP, detail);
  }
}

// --- Supporting Interfaces and Types ---
interface DroppableElement extends HTMLElement {
  // Callback for droppable-controlled ghost rendering/positioning
  // _dnd_onDragOver?: OnDragOverFunction;
  // Add dataset property for easier access in TypeScript
  dataset: DOMStringMap & {
    droppableAccepts?: string;
  };
}

type DragAxis = "both" | "x" | "y";

// Raw positional data during a drag operation
export type DragPositionData = {
  axis: DragAxis; // The axis constraint
  clientX: number; // Current x-coordinate of the pointer
  clientY: number; // Current y-coordinate of the pointer
  startX: number; // x-coordinate of the drag start (relative to viewport)
  startY: number; // y-coordinate of the drag start (relative to viewport)
  offsetX: number; // x-offset of pointer from node's left edge at start
  offsetY: number; // y-offset of pointer from node's top edge at start
};

// Parameters for the draggable action
type DraggableParams<T> = {
  type: string; // Type identifier
  data?: T; // Associated data payload
  onDragStart?: (event: DragStartEvent<T>) => void;
  onDrop?: (event: DropEvent<T>) => void;
  onDragOver?: (event: DragOverEvent) => void;
  axis?: DragAxis;
  devDelay?: number; // Debugging delay for ghost removal
};

// Parameters for the droppable action
type DroppableParams<T = any> = {
  accepts?: string[]; // Types this droppable accepts
  onDrop?: (event: DropEvent<T>) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnter?: (event: DragEnterEvent) => void;
  onDragLeave?: (event: DragLeaveEvent) => void;
};

// --- Drag-Group API (Internal Use) ---

// API provided by the dragGroup action via the module map (internal to the dnd module)
export interface GroupApi {
  groupNode: HTMLElement;
  groupId: number; // Still needed internally for map lookups

  // Methods called by draggable
  notifyMemberDragStart: (draggingNode: HTMLElement) => void;
  notifyMemberDragEnd: (draggingNode: HTMLElement) => void;

  // Internal storage for user overrides (now using the refined detail types)
  _internal_onMemberDragStart?: DragGroupParams["onMemberDragStart"];
  _internal_onMemberDragEnd?: DragGroupParams["onMemberDragEnd"];
}

// Params for the dragGroup action, containing optional overrides
interface DragGroupParams {
  onMemberDragStart?: (
    detail: {
      initiatorNode: HTMLElement; // The specific member that started dragging
      groupMembers: HTMLElement[]; // All current members of the group
    },
    defaultFn: () => void
  ) => void;
  onMemberDragEnd?: (
    detail: {
      initiatorNode: HTMLElement; // The specific member that finished dragging
      groupMembers: HTMLElement[]; // All current members of the group
    },
    defaultFn: () => void
  ) => void;
}

//#endregion


// --- Drag Group Implementation ---

// Module-level store for Group APIs, replacing Svelte context for runtime access
let nextGroupId = 0;
const groupApis = new Map<number, GroupApi>();

export function dragGroup(node: HTMLElement, params?: DragGroupParams) {
  const uniqueGroupId = nextGroupId++;
  node.dataset.dragGroupId = uniqueGroupId.toString();
  node.classList.add("dnd-group"); // Add class for potential styling/querying

  let currentlyDraggingNode: HTMLElement | null = null;
  let nodeOrigPointerEvents = node.style.pointerEvents;


  const members: HTMLElement[] = [];

  const notifyMemberDragStart = (draggingNode: HTMLElement) => {
    if (currentlyDraggingNode) {
      console.warn(
        `Group ${uniqueGroupId}: Received drag start for`,
        draggingNode,
        "while already tracking",
        currentlyDraggingNode
      );
      // TODO Optionally force-end the previous drag's state? Or ignore?
      // For now, let's assume this is expected behavior.
    }
    currentlyDraggingNode = draggingNode;

    // Query potential draggable elements within this group node
    const potentialMembers = node.querySelectorAll<HTMLElement>(
      '[draggable="true"]'
    );
    members.length = 0; // Clear previous members
    potentialMembers.forEach((member) => {
      // Check if *this* group node is the *closest* group ancestor
      const closestGroup = member.closest<HTMLElement>(
        `[${DRAG_GROUP_ID_ATTR}]`
      );
      if (closestGroup === node) {
        members.push(member);
      }
    });

    nodeOrigPointerEvents = node.style.pointerEvents;

    // Define the default behavior
    const defaultPointerEventLogic = () => {
      node.style.pointerEvents = "none"; // Disable the group's pointer handling
    };

    // Check for and call the user override stored in the API object
    const userOverride = groupApi._internal_onMemberDragStart; // Access stored override
    if (userOverride) {
      userOverride(
        {
          initiatorNode: draggingNode,
          groupMembers: members,
          // groupNode: node, This may be useful in nested-group scenarios, but most often, this use:dragGroup node IS the "groupNode"
        },
        defaultPointerEventLogic
      );
    } else {
      // No override, run default logic
      defaultPointerEventLogic();
    }
  };

  const notifyMemberDragEnd = (draggingNode: HTMLElement) => {
    if (currentlyDraggingNode !== draggingNode) {
      console.warn(
        `Group ${uniqueGroupId}: Received drag end for`,
        draggingNode,
        "but was tracking",
        currentlyDraggingNode
      );
      // Don't clean up if it's not the node we were tracking
      return;
    }

    // Define default cleanup behavior
    const defaultCleanupLogic = () => {
      node.style.pointerEvents = nodeOrigPointerEvents; // Restore pointer handling
    };

    // Check for and call the user override stored in the API object
    const userOverride = groupApi._internal_onMemberDragEnd; // Access stored override
    if (userOverride) {
      userOverride(
        {
          initiatorNode: draggingNode,
          groupMembers: members,
          // groupNode: node, This may be useful in nested-group scenarios, but most often, this use:dragGroup node IS the "groupNode"
        },
        defaultCleanupLogic
      );
    } else {
      // No override, run default cleanup
      defaultCleanupLogic();
    }

    // Reset tracking state
    currentlyDraggingNode = null;
  };

  const groupApi: GroupApi = {
    groupNode: node,
    groupId: uniqueGroupId,
    notifyMemberDragStart, // Expose the handler
    notifyMemberDragEnd, // Expose the handler
    // Store overrides internally for the handlers to access
    _internal_onMemberDragStart: params?.onMemberDragStart,
    _internal_onMemberDragEnd: params?.onMemberDragEnd,
  };

  // Register the API in the module-level map
  groupApis.set(uniqueGroupId, groupApi);

  return {
    update(newParams?: DragGroupParams) {
      const currentApi = groupApis.get(uniqueGroupId);
      if (currentApi) {
        // Update the stored internal overrides
        currentApi._internal_onMemberDragStart = newParams?.onMemberDragStart;
        currentApi._internal_onMemberDragEnd = newParams?.onMemberDragEnd;
      }
    },
    destroy() {
      // If a drag is somehow ongoing when destroyed, try to clean up pointer events
      if (currentlyDraggingNode) {
        node.style.pointerEvents = nodeOrigPointerEvents;
      }
      groupApis.delete(uniqueGroupId);
      node.removeAttribute(DRAG_GROUP_ID_ATTR);
      node.classList.remove("dnd-group");
    },
  };
}

export function draggable<T>(
  node: HTMLElement,
  {
    type: draggableType = "unknown",
    data,
    onDragStart, // User callback for native event
    onDrop, // User callback for native event
    onDragOver, // Consolidated callback for ghost appearance AND position
    axis = "both",
    devDelay,
  }: DraggableParams<T>
) {
  node.setAttribute("draggable", "true"); // Necessary for HTML drag API, though we override behavior
  node.classList.add(DRAGGABLE_CSS_CLASS);

  let isDragging = false;
  let startX: number, startY: number, offsetX: number, offsetY: number;
  let ghost: HTMLElement;

  // Event listeners for syntactic sugar
  const eventListeners: Array<{ event: string; handler: EventListener }> = [];

  // Helper to manage event listeners
  function addManagedListener(event: string, handler: EventListener) {
    node.addEventListener(event, handler);
    eventListeners.push({ event, handler });
  }

  function removeAllManagedListeners() {
    eventListeners.forEach(({ event, handler }) => {
      node.removeEventListener(event, handler);
    });
    eventListeners.length = 0;
  }

  // Necessary for the update-props callback
  function setupEventListeners(props: DraggableParams<T>) {
    removeAllManagedListeners();
    if (props.onDragStart) {
      addManagedListener(eventNames.DRAGSTART, props.onDragStart as EventListener);
    }
    if (props.onDrop) {
      addManagedListener(eventNames.DROP, props.onDrop as EventListener);
    }
    if (props.onDragOver) {
      addManagedListener(eventNames.DRAGOVER, props.onDragOver as EventListener);
    }
  }
  setupEventListeners({ onDragStart, onDragOver, onDrop } as DraggableParams<T>);

  // Handle both mouse and touch start events
  function handleStart(event: MouseEvent | TouchEvent) {
    const isTouch = event.type === "touchstart";
    const clientX = isTouch
      ? (event as TouchEvent).touches[0].clientX
      : (event as MouseEvent).clientX;
    const clientY = isTouch
      ? (event as TouchEvent).touches[0].clientY
      : (event as MouseEvent).clientY;

    // Prevent default actions like text selection or native drag
    event.preventDefault();
    event.stopPropagation();

    isDragging = true;

    // --- Group Logic: Just-in-Time Detection ---
    const groupElement = node.closest<HTMLElement>(`[${DRAG_GROUP_ID_ATTR}]`);
    let groupApi: GroupApi | undefined;

    if (groupElement && groupElement.dataset.dragGroupId) {
      const groupId = parseInt(groupElement.dataset.dragGroupId, 10);
      groupApi = groupApis.get(groupId);
    }

    // Create ghost element
    const groupNode = groupElement ?? node; // Use the group as the ghost if available
    ghost = groupNode.cloneNode(true) as HTMLElement;
    ghost.setAttribute("draggable", "false"); // Prevent nested dragging
    ghost.classList.remove(DRAGGABLE_CSS_CLASS);
    ghost.classList.add("dnd-ghost");
    copyComputedSizeAndPosition(groupNode, ghost); // Ensure ghost has same dimensions

    // Prevent pointer events on the original node while dragging its ghost
    // TODO this is redundant with dragGroup's behaviour, but it's necessary in the case there isn't a group to handle this draggable...
    const initialPointerEvents = node.style.pointerEvents;

    // Use timeout 0 to ensure this runs after other start logic potentially setting pointerEvents
    setTimeout(() => {
      node.style.pointerEvents = "none";
    }, 0);

    // Calculate initial cursor offset relative to the node's top-left corner
    const rect = node.getBoundingClientRect();
    startX = rect.left;
    startY = rect.top;
    offsetX = rect.left - clientX;
    offsetY = rect.top - clientY;

    document.body.appendChild(ghost); // Add ghost to the body


    // Dispatch dnd-dragstart events
    if (groupApi) {
      // *** Notify the group that this node started dragging ***
      groupApi.notifyMemberDragStart(node);
    }
    const dragStartEvent = new DragStartEvent({
      draggableType,
      data,
      initiatorNode: node,
      node: groupNode,
      ghost,
      clientX,
      clientY,
    });
    node.dispatchEvent(dragStartEvent);

    let dropTarget: DroppableElement | null = null;
    let lastDropTarget: DroppableElement | null = null;

    function moveGhost(moveEvent: MouseEvent | TouchEvent) {
      if (!isDragging) return;

      const isTouchMove = moveEvent.type.includes("touch");
      // Prevent scrolling on touch devices during drag
      if (isTouchMove) moveEvent.preventDefault();

      const clientX = isTouchMove
        ? (moveEvent as TouchEvent).touches[0].clientX
        : (moveEvent as MouseEvent).clientX;
      const clientY = isTouchMove
        ? (moveEvent as TouchEvent).touches[0].clientY
        : (moveEvent as MouseEvent).clientY;

      // Determine the potential drop target under the cursor
      ghost.classList.remove(VALID_DROP_CLASS, INVALID_DROP_CLASS); // Reset visual state
      const dropInfo = getValidDroppableUnderMouse(
        { clientX, clientY } as DragEvent, // Cast needed for elementFromPoint
        draggableType ?? "any"
      );
      dropTarget = dropInfo?.dropTarget ?? null; // Update dropTarget in outer scope
      let dropTargetValid = dropInfo?.isValid;

      // Prepare data for positioning and rendering callbacks
      // Note: newX/newY removed, calculated inside defaultRenderFn or user override
      const posData: DragPositionData = {
        axis,
        clientX,
        clientY,
        startX,
        startY,
        offsetX,
        offsetY,
      };

      // --- Event Dispatching for Droppables ---
      const dragDetail: DndEventDetail = {
        draggableType,
        data,
        initiatorNode: node,
        node: groupNode,
        ghost,
        clientX,
        clientY,
      };

      if (dropTarget !== lastDropTarget) {
        if (lastDropTarget) {
          lastDropTarget.dispatchEvent(new DragLeaveEvent(dragDetail));
        }
        if (dropTarget) {
          dropTarget.dispatchEvent(new DragEnterEvent(dragDetail));
        }
      }

      // --- Handle sequential render overrides --

      // Define Helper Functions passed to overrides
      const setPosition = ({ x, y }: { x?: number, y?: number }) => {
        if (x) ghost.style.left = `${x}px`;
        if (y) ghost.style.top = `${y}px`;
      };

      const overDetail: DragOverEventDetail = {
        ...dragDetail,
        ghost,
        posData,
        setGhostPosition: setPosition,
        currentDroppableTarget: dropTarget, // Pass the current droppable
      };

      // Dispatch a custom event for drag over rendering
      const dragOverEvent = new DragOverEvent(overDetail);

      // Apply visual state to ghost based on drop target validity
      if (dropTarget) {
        ghost.classList.add(dropTargetValid ? VALID_DROP_CLASS : INVALID_DROP_CLASS);
      }

      // Execute the rendering logic
      node.dispatchEvent(dragOverEvent);

      // Execute the default positioning logic if not prevented
      if (!dragOverEvent.defaultPrevented) {
        let x, y;
        if (axis !== "y") x = clientX + offsetX;
        else x = startX; // Lock x

        if (axis !== "x") y = clientY + offsetY;
        else y = startY; // Lock y
        setPosition({ x, y });
      }

      // Give the droppable the last say on position
      if (!dragOverEvent.defaultPrevented
        && dropTarget?.getAttribute(CONTROLS_DRAGGABLE_ATTR)
      ) {
        dropTarget.dispatchEvent(dragOverEvent);
      }

      lastDropTarget = dropTarget;
      // --- End Event Dispatching and Ghost Rendering ---
    }

    moveGhost(event); // Initial positioning and rendering

    // Add move listeners
    document.addEventListener("mousemove", moveGhost);
    document.addEventListener("touchmove", moveGhost, { passive: false }); // Need passive: false to preventDefault

    // --- Cleanup function ---
    function cleanup() {
      if (!isDragging) return; // Avoid cleanup if drag didn't properly start
      isDragging = false;

      document.removeEventListener("mousemove", moveGhost);
      document.removeEventListener("touchmove", moveGhost);

      if (groupApi) {

        groupApi.notifyMemberDragEnd(node);
      }

      // Remove ghost (with optional delay for debugging)
      if (devDelay) {
        setTimeout(() => ghost?.remove(), devDelay);
      } else {
        ghost?.remove();
      }

      // Restore original node's pointer events
      node.style.pointerEvents = initialPointerEvents || "initial"; // Restore original or remove
      // Remove end listeners (added below) - crucial to prevent leaks
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchend", handleEnd);
    }

    // --- End event handler ---
    function handleEnd(event: MouseEvent | TouchEvent) {
      if (!isDragging) return;

      const isTouchEnd = event.type.includes("touch");
      const clientX = isTouchEnd
        ? (event as TouchEvent).changedTouches[0].clientX
        : (event as MouseEvent).clientX;
      const clientY = isTouchEnd
        ? (event as TouchEvent).changedTouches[0].clientY
        : (event as MouseEvent).clientY;

      // Final check for drop target at the exact drop point
      const finalDropInfo = getValidDroppableUnderMouse(
        { clientX, clientY } as DragEvent,
        draggableType ?? "any"
      );
      const finalDropTarget = finalDropInfo?.dropTarget;
      const finalDropValid = finalDropInfo?.isValid;

      // Call user's native drag end callback

      // Dispatch custom drop event
      const dropEvent = new DropEvent({
        dropAllowed: !!finalDropTarget && !!finalDropValid,
        draggableType,
        data,
        initiatorNode: node,
        node: groupNode,
        ghost,
        clientX,
        clientY,
      });

      if (finalDropTarget && finalDropValid) {
        finalDropTarget.dispatchEvent(dropEvent);
        // resetAllDroppableStates();
      } else {
        // Dispatch drop event on the draggable node itself for failed drops
        node.dispatchEvent(dropEvent);
        // resetAllDroppableStates();
      }

      // Perform cleanup regardless of drop success
      cleanup();
    }

    // Add end listeners to the document
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchend", handleEnd);
  } // End handleStart

  // Attach start listeners to the node
  node.addEventListener("mousedown", handleStart);
  node.addEventListener("touchstart", handleStart, { passive: false }); // passive: false needed for preventDefault

  return {
    update(newProps: DraggableParams<any>) {
      // Update configurable properties
      axis = newProps.axis ?? axis;
      data = newProps.data ?? data;
      draggableType = newProps.type;
      devDelay = newProps.devDelay;

      // Re-setup event listeners with new callbacks
      setupEventListeners(newProps);
      // Note: Group association is determined at drag start, cannot be updated dynamically this way.
    },
    destroy() {
      // Remove all managed event listeners
      removeAllManagedListeners();

      // Remove event listeners
      node.removeEventListener("mousedown", handleStart);
      node.removeEventListener("touchstart", handleStart);
      // No group unregister needed as API is looked up dynamically
      node.classList.remove(DRAGGABLE_CSS_CLASS);
      node.removeAttribute("draggable");
    },
  };
}

// --- Droppable Implementation ---


export function droppable(
  node: DroppableElement,
  {
    accepts = ["*"], // Default to accepting anything
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }: DroppableParams
) {
  node.setAttribute(DROPPABLE_ACCEPTS_ATTR, accepts.join(","));
  node.classList.add(DROPPABLE_CSS_CLASS);

  // Event listeners for syntactic sugar
  const eventListeners: Array<{ event: string; handler: EventListener }> = [];

  // Helper to manage event listeners
  function addManagedListener(event: string, handler: EventListener) {
    node.addEventListener(event, handler);
    eventListeners.push({ event, handler });
  }

  function removeAllManagedListeners() {
    eventListeners.forEach(({ event, handler }) => {
      node.removeEventListener(event, handler);
    });
    eventListeners.length = 0;
  }

  // Set up initial event listeners from params
  function setupEventListeners(params: DroppableParams) {
    removeAllManagedListeners();

    if (params.onDrop) {
      addManagedListener(eventNames.DROP, params.onDrop as EventListener);
    }

    if (params.onDragEnter) {
      addManagedListener(eventNames.DRAGENTER, params.onDragEnter as EventListener);
    }

    if (params.onDragOver) {
      // Add attribute to signal that this droppable controls ghost rendering/position
      node.setAttribute(CONTROLS_DRAGGABLE_ATTR, "true");
      addManagedListener(eventNames.DRAGOVER, params.onDragOver as EventListener);
    } else {
      node.removeAttribute(CONTROLS_DRAGGABLE_ATTR);
    }

    if (params.onDragLeave) {
      addManagedListener(eventNames.DRAGLEAVE, params.onDragLeave as EventListener);
    }

  }

  setupEventListeners({ accepts, onDrop, onDragOver, onDragEnter, onDragLeave });

  // --- Custom Event Handlers ---
  function handleDragEnter(event: DragEnterEvent) {
    const { draggableType: type } = event.detail;
    // Apply visual feedback based on type match
    node.classList.toggle(VALID_DROP_CLASS, matchesDndType(type, accepts));
    node.classList.toggle(INVALID_DROP_CLASS, !matchesDndType(type, accepts));
  }

  function handleDragOver(event: DragOverEvent) {
    // Useful for continuous styling.
    const { draggableType: type } = event.detail;
    node.classList.toggle(VALID_DROP_CLASS, matchesDndType(type, accepts));
    node.classList.toggle(INVALID_DROP_CLASS, !matchesDndType(type, accepts));
  }

  function handleDragLeave(event: DragLeaveEvent) {
    // Remove visual feedback when dragging leaves
    node.classList.remove(VALID_DROP_CLASS, INVALID_DROP_CLASS);
  }

  function handleDrop(event: DropEvent) {
    // Remove visual feedback on drop
    node.classList.remove(VALID_DROP_CLASS, INVALID_DROP_CLASS);
    const { draggableType: type } = event.detail;
    // Only allow the drop event to bubble if type matches
    // Edit: This is the responsibility of the consumer...
    // if (!matchesDndType(type, accepts)) {
    //   event.stopPropagation();
    // }
  }

  // Add listeners for custom DND events
  node.addEventListener(eventNames.DRAGENTER, handleDragEnter as EventListener);
  node.addEventListener(eventNames.DRAGOVER, handleDragOver as EventListener);
  node.addEventListener(eventNames.DRAGLEAVE, handleDragLeave as EventListener);
  node.addEventListener(eventNames.DROP, handleDrop as EventListener);

  return {
    update(newParams: DroppableParams) {
      accepts = newParams.accepts ?? accepts;
      node.setAttribute(DROPPABLE_ACCEPTS_ATTR, accepts.join(","));

      // Re-setup event listeners with new callbacks
      setupEventListeners(newParams);
    },
    destroy() {
      // Remove all managed event listeners
      removeAllManagedListeners();

      // Remove listeners and cleanup attributes/properties
      node.removeEventListener(
        eventNames.DRAGENTER,
        handleDragEnter as EventListener
      );
      node.removeEventListener(
        eventNames.DRAGOVER,
        handleDragOver as EventListener
      );
      node.removeEventListener(
        eventNames.DRAGLEAVE,
        handleDragLeave as EventListener
      );
      node.removeEventListener(eventNames.DROP, handleDrop as EventListener);

      // These may be unnecessary since this node is gettin destroyed already...
      node.classList.remove(DROPPABLE_CSS_CLASS, VALID_DROP_CLASS, INVALID_DROP_CLASS);
      node.removeAttribute(DROPPABLE_ACCEPTS_ATTR);
      node.removeAttribute(CONTROLS_DRAGGABLE_ATTR);
    },
  };
}

function resetAllDroppableStates() {  
  document.querySelectorAll(DROPPABLE_CSS_CLASS).forEach(el => el.classList.remove(VALID_DROP_CLASS, INVALID_DROP_CLASS));
}

//#region Utilities

export function matchesDndType(
  type: string | undefined,
  pattern: string | string[]
): boolean {
  if (!type) return false;

  const patterns = Array.isArray(pattern)
    ? pattern
    : pattern.split(",").map((p) => p.trim());

  for (const p of patterns) {
    if (p === type || p === "*") return true;
    if (p.endsWith("/*") && type.startsWith(p.slice(0, -2) + "/")) {
      return true;
    }
  }
  return false;
}

function copyComputedSizeAndPosition(source: HTMLElement, target: HTMLElement) {
  const computedStyle = window.getComputedStyle(source);
  target.style.width = computedStyle.width;
  target.style.height = computedStyle.height;
  target.style.boxSizing = computedStyle.boxSizing;
  // Add margin copy? Might be needed for accurate positioning in some layouts
  // target.style.margin = computedStyle.margin;
  // Position absolute is crucial for ghost positioning
  target.style.position = "absolute";
  target.style.zIndex = "9999"; // Ensure ghost is on top

  const sourceRect = source.getBoundingClientRect();
  target.style.top = sourceRect.top + "px";
  target.style.left = sourceRect.left + "px";
}

function getValidDroppableUnderMouse(
  event: { clientX: number; clientY: number }, // Simplified interface
  type: string
): { isValid: boolean; dropTarget: DroppableElement | null } | null {
  // Temporarily hide the ghost
  const ghost = document.querySelector(".dnd-ghost") as HTMLElement | null;
  let originalDisplay = "";
  if (ghost) {
    originalDisplay = ghost.style.display;
    ghost.style.display = "none";
  }

  const elemUnderCursor = document.elementFromPoint(
    event.clientX,
    event.clientY
  );

  // Restore ghost visibility
  if (ghost) {
    ghost.style.display = originalDisplay;
  }

  if (!elemUnderCursor) return null;

  // Find the nearest droppable ancestor
  const dropZone = elemUnderCursor.closest<DroppableElement>(
    `[${DROPPABLE_ACCEPTS_ATTR}]`
  );

  if (!dropZone) return null;

  // Check if the found dropzone accepts the draggable type
  const accepts = dropZone.dataset.droppableAccepts || "";
  const isValid = matchesDndType(type, accepts);

  return { isValid, dropTarget: dropZone };
}

//#endregion