import type { NotFoundError, Err, NotAuthorizedError, InvalidStateError } from "$domain/errors";
import { type Result } from "$domain/result";

//#region Task Interface and Utilities

export type Task = ITask<Date>
/**
 * System-agnostic task type that works with both Date (client) and number (Convex) timestamps
 * @template T - Any type that can be converted to a Date()
 */
export interface ITask<T> {
    // Indexing
    id: string,
    userAuthId: string,


    // Content
    /**
     * @root an organizational task the all parentless tasks are attached to
     * @task normal task
     */
    type: "task" | "root",
    title: string,
    content?: string,
    status: TaskStatus,


    // Prioritization Fields
    /** 
     * Tasks that depend on this one's completion.
    */
    parents: string[]
    /** 
     * This task's prequisite[s].
    */
    children: string[]
    todaysTask?: T, // Time of assignment
    dueDate?: T,


    // Metadata
    created: T,
    lastEdit: T,
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
}


export function isTaskCompleted(task: Task): boolean {
    return task.status === TaskStatus.complete;
}

//#endregion


//#region Shared Functions

// Shared logic that both client and server can use
export type RelationshipOperation =
    | { type: "addChild"; childId: string }
    | { type: "removeChild"; childId: string }
    | { type: "addParent"; parentId: string }
    | { type: "removeParent"; parentId: string };

export function calculateRelationshipUpdates<T>(
    changes: Array<{ oldTask: ITask<T> | null; newTask: ITask<T> | null }>
): Array<{ taskId: string; operations: RelationshipOperation[] }> {
    const updates = new Map<string, RelationshipOperation[]>();

    // Helper to add operation
    const addOperation = (id: T, op: RelationshipOperation) => {
        const key = String(id);
        if (!updates.has(key)) {
            updates.set(key, []);
        }
        updates.get(key)!.push(op);
    };

    for (const { oldTask, newTask } of changes) {
        const oldParents = new Set(oldTask?.parents?.map(String) ?? []);
        const oldChildren = new Set(oldTask?.children?.map(String) ?? []);
        const newParents = new Set(newTask?.parents?.map(String) ?? []);
        const newChildren = new Set(newTask?.children?.map(String) ?? []);

        // Parents added to this task -> add this task as child to those parents
        const addedParents = [...newParents].filter(p => !oldParents.has(p));
        for (const parentId of addedParents) {
            addOperation(parentId as T, { type: "addChild", childId: newTask!.id });
        }

        // Parents removed from this task -> remove this task as child from those parents
        const removedParents = [...oldParents].filter(p => !newParents.has(p));
        for (const parentId of removedParents) {
            addOperation(parentId as T, { type: "removeChild", childId: oldTask!.id });
        }

        // Children added to this task -> add this task as parent to those children
        const addedChildren = [...newChildren].filter(c => !oldChildren.has(c));
        for (const childId of addedChildren) {
            addOperation(childId as T, { type: "addParent", parentId: newTask!.id });
        }

        // Children removed from this task -> remove this task as parent from those children
        const removedChildren = [...oldChildren].filter(c => !newChildren.has(c));
        for (const childId of removedChildren) {
            addOperation(childId as T, { type: "removeParent", parentId: oldTask!.id });
        }
    }

    return Array.from(updates.entries()).map(([taskId, operations]) => ({
        taskId,
        operations
    }));
}

export function applyRelationshipOperations<T>(
    task: ITask<T>,
    operations: RelationshipOperation[]
): ITask<T> {
    let parents = [...(task.parents ?? [])];
    let children = [...(task.children ?? [])];

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
        ...task,
        parents,
        children,
    };
}

//#endregion


//#region API Interfaces

// TODO: In the future, add CRDT/merge-aware methods for concurrent edits


/**
 * Delta describing a task change. Creation: oldTask=null. Deletion: newTask=null.
 */
export type TaskDelta = { oldTask: Task | null; newTask: Task | null };


// #region Shared function parameter types


// All fields in the Omit<> become optional
export type CreateTaskParams<T = Date> = Partial<ITask<T>> & Omit<ITask<T>,
    // | "id"
    | "created"
    | "lastEdit"
    | "todaysTask"
    | "status"
    | "parents"
    | "children"
// | "filepath"
>
export type PopulatedTaskDTO = Partial<Task> & Omit<Task, "id">
export type TaskRelationsUpdate = (string | { ids: string[], op: "add" | "remove" })[]
type TaskUpdate<T> = Omit<ITask<T>, "children" | "parents">
    & {
        parents?: TaskRelationsUpdate,
        children?: TaskRelationsUpdate
    }
export type UpdateTaskParams<T = Date> = { id: string, data: Partial<TaskUpdate<T>> };

//#endregion

//#endregion

