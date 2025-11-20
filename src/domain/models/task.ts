import type { NotFoundError, Err, NotAuthorizedError, InvalidStateError } from "$domain/errors";
import { type Result } from "$domain/result";
import type { GraphData, IGraphNode as IGraphNode } from "./node";
import type { ProjectData } from "./project";

//#region Task Data Interface and Utilities

/**
 * Task type alias - a full node containing task data
 * This is what the API returns and what the UI consumes
 */
export type Task<TimeFormat = Date> = IGraphNode<TaskData<TimeFormat>, TimeFormat>;

/**
 * Task-specific data embedded in nodes
 * @template TimeFormat - Any type that can be converted to Date() for timestamps
 */
export interface TaskData<TimeFormat = Date> {
    type: "task";
    title: string;
    content?: string;
    status: TaskStatus;
    todaysTask?: TimeFormat; // Time of assignment
    dueDate?: TimeFormat;
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
    // cancelled = 2,
    // onHold = 3,
    // deferred = 4,
    // deleted = 5,
    // archived = 6,
    // snoozed = 7,
    // repeated = 8,
    // recurring = 9,
    // scheduled = 10,
}


export function isTaskCompleted(task: Task): boolean {
    return task.data.status === TaskStatus.complete;
}

//#endregion


//#region Shared Graph Relationship Functions

// Shared logic that both client and server can use
// These work on the graph structure level (Node), not the data level (TaskData/ProjectData)

export type RelationshipOperation =
    | { type: "addChild"; childId: string }
    | { type: "removeChild"; childId: string }
    | { type: "addParent"; parentId: string }
    | { type: "removeParent"; parentId: string };

/**
 * Interface for any entity with graph relationships
 */
interface GraphEntity {
    id: string;
    parents: string[];
    children: string[];
}

/**
 * Calculate relationship updates needed when nodes change
 * Works with both Node<T> and legacy ITask<T> types
 */
export function calculateRelationshipUpdates<T extends GraphEntity>(
    changes: Array<{ oldTask: T | null; newTask: T | null }>
): Array<{ taskId: string; operations: RelationshipOperation[] }> {
    const updates = new Map<string, RelationshipOperation[]>();

    // Helper to add operation
    const addOperation = (id: string, op: RelationshipOperation) => {
        if (!updates.has(id)) {
            updates.set(id, []);
        }
        updates.get(id)!.push(op);
    };

    for (const { oldTask, newTask } of changes) {
        const oldParents = new Set(oldTask?.parents?.map(String) ?? []);
        const oldChildren = new Set(oldTask?.children?.map(String) ?? []);
        const newParents = new Set(newTask?.parents?.map(String) ?? []);
        const newChildren = new Set(newTask?.children?.map(String) ?? []);

        // Parents added to this node -> add this node as child to those parents
        const addedParents = [...newParents].filter(p => !oldParents.has(p));
        for (const parentId of addedParents) {
            addOperation(parentId, { type: "addChild", childId: newTask!.id });
        }

        // Parents removed from this node -> remove this node as child from those parents
        const removedParents = [...oldParents].filter(p => !newParents.has(p));
        for (const parentId of removedParents) {
            addOperation(parentId, { type: "removeChild", childId: oldTask!.id });
        }

        // Children added to this node -> add this node as parent to those children
        const addedChildren = [...newChildren].filter(c => !oldChildren.has(c));
        for (const childId of addedChildren) {
            addOperation(childId, { type: "addParent", parentId: newTask!.id });
        }

        // Children removed from this node -> remove this node as parent from those children
        const removedChildren = [...oldChildren].filter(c => !newChildren.has(c));
        for (const childId of removedChildren) {
            addOperation(childId, { type: "removeParent", parentId: oldTask!.id });
        }
    }

    return Array.from(updates.entries()).map(([taskId, operations]) => ({
        taskId,
        operations
    }));
}

/**
 * Apply relationship operations to a graph entity
 * Works with both Node<T> and legacy ITask<T> types
 */
export function applyRelationshipOperations<T extends GraphEntity>(
    entity: T,
    operations: RelationshipOperation[]
): T {
    let parents = [...(entity.parents ?? [])];
    let children = [...(entity.children ?? [])];

    for (const op of operations) {
        switch (op.type) {
            case "addChild":
                if (!children.some(id => String(id) === String(op.childId))) {
                    children.push(op.childId);
                }
                break;
            case "removeChild":
                children = children.filter(id => String(id) !== String(op.childId));
                break;
            case "addParent":
                if (!parents.some(id => String(id) === String(op.parentId))) {
                    parents.push(op.parentId);
                }
                break;
            case "removeParent":
                parents = parents.filter(id => String(id) !== String(op.parentId));
                break;
        }
    }

    return {
        ...entity,
        parents,
        children,
    };
}

//#endregion


//#region API Interfaces

// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

export interface ExportedData {
    version: string;
    exportedAt: string;
    nodes: any[];
}


// #region Shared function parameter types

type StrippedNodeParams<DataType, TimeFormat = Date> = Partial<Omit<IGraphNode<any, TimeFormat>, "data" | "id">> & Omit<DataType, "type">;

export type CreateNodeParams<DataType = unknown, TimeFormat = Date> = Partial<StrippedNodeParams<DataType, TimeFormat>> & DataType;
export type CreateTaskParams<TimeFormat = Date> = Partial<StrippedNodeParams<TaskData<TimeFormat>, TimeFormat>> & { id?: string; title: string }


type TaskUpdate<TimeFormat = Date> = Partial<TaskData<TimeFormat>>
    & {
        addParents: string[];
        addChildren: string[];
        removeParents: string[];
        removeChildren: string[];
    }

export type UpdateTaskParams<TimeFormat = Date> = { id: string; } & Partial<StrippedNodeParams<TaskUpdate<TimeFormat>, TimeFormat>>;

export type PopulatedTaskDTO = Partial<TaskData> & Omit<TaskData, "id">;

//#endregion

//#endregion

