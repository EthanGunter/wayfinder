import type { NotFoundError, Err, NotAuthorizedError, InvalidStateError } from "$domain/errors";
import { type Result } from "$domain/result";

//#region Task Interface and Utilities

export type Task = ITask
export interface ITask {
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
    todaysTask?: Date, // Time of assignment
    dueDate?: Date,


    // Metadata
    created: Date,
    lastEdit: Date,
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
}


export function isTaskCompleted(task: Task): boolean {
    return task.status === TaskStatus.complete;
}


export function taskEquals(a: Task, b: Task, ignoreId: boolean = false): boolean {
    if (!ignoreId && a.id !== b.id) return false;
    return a.userAuthId === b.userAuthId
        && a.title === b.title
        && a.content === b.content
        && a.status === b.status
        && a.parents === b.parents
        && a.children === b.children
        && a.created === b.created;
    // && a.last_edit === b.last_edit // This might cause change between checks on server and local
}

//#endregion


//#region Shared Functions

/**
 * System-agnostic task type that works with both Date (client) and number (Convex) timestamps
 */
export type SystemAgnosticTask<T = Date> = Omit<Task, 'todaysTask' | 'created' | 'lastEdit' | 'dueDate'> & {
    todaysTask?: T;
    dueDate?: T;
    created: T;
    lastEdit: T;
};

/**
 * Describes a change needed for a single task's relationships
 */
export interface RelationshipChange {
    taskId: string;
    addParents?: string[];
    removeParents?: string[];
    addChildren?: string[];
    removeChildren?: string[];
}

/**
 * Input for calculating relationship updates
 */
export interface RelationshipUpdate<T = Date> {
    oldTask: SystemAgnosticTask<T> | null;
    newTask: SystemAgnosticTask<T> | null;
}

/**
 * Calculates what relationship changes are needed when tasks are created, updated, or deleted.
 * This is a pure function that doesn't perform any database operations.
 * 
 * @param updates - Single update or array of updates describing task changes
 * @returns Array of relationship changes needed to maintain bidirectional consistency
 * 
 * @example
 * // Task A adds B as a child
 * const changes = calculateRelationshipChanges({
 *   oldTask: { id: 'A', children: [], parents: [], ... },
 *   newTask: { id: 'A', children: ['B'], parents: [], ... }
 * });
 * // Result: [{ taskId: 'B', addParents: ['A'] }]
 */
export function calculateRelationshipChanges<T = Date>(
    updates: RelationshipUpdate<T> | RelationshipUpdate<T>[]
): RelationshipChange[] {
    const updateArray = Array.isArray(updates) ? updates : [updates];

    // Track all changes needed per task ID
    const changeMap = new Map<string, RelationshipChange>();

    const ensureChange = (taskId: string): RelationshipChange => {
        if (!changeMap.has(taskId)) {
            changeMap.set(taskId, { taskId });
        }
        return changeMap.get(taskId)!;
    };

    const addToSet = (target: string[] | undefined, ...values: string[]): string[] => {
        const set = new Set(target || []);
        values.forEach(v => set.add(v));
        return Array.from(set);
    };

    // Process each update
    for (const { oldTask, newTask } of updateArray) {
        if (!oldTask && newTask) {
            // New task created - add reciprocal relationships
            for (const childId of newTask.children) {
                const change = ensureChange(childId);
                change.addParents = addToSet(change.addParents, newTask.id);
            }
            for (const parentId of newTask.parents) {
                const change = ensureChange(parentId);
                change.addChildren = addToSet(change.addChildren, newTask.id);
            }
        }
        else if (oldTask && !newTask) {
            // Task deleted - remove from all relationships
            for (const childId of oldTask.children) {
                const change = ensureChange(childId);
                change.removeParents = addToSet(change.removeParents, oldTask.id);
            }
            for (const parentId of oldTask.parents) {
                const change = ensureChange(parentId);
                change.removeChildren = addToSet(change.removeChildren, oldTask.id);
            }
        }
        else if (oldTask && newTask) {
            // Task updated - handle added/removed relationships
            const addedParents = newTask.parents.filter(p => !oldTask.parents.includes(p));
            const removedParents = oldTask.parents.filter(p => !newTask.parents.includes(p));
            const addedChildren = newTask.children.filter(c => !oldTask.children.includes(c));
            const removedChildren = oldTask.children.filter(c => !newTask.children.includes(c));

            for (const parentId of addedParents) {
                const change = ensureChange(parentId);
                change.addChildren = addToSet(change.addChildren, newTask.id);
            }
            for (const parentId of removedParents) {
                const change = ensureChange(parentId);
                change.removeChildren = addToSet(change.removeChildren, newTask.id);
            }
            for (const childId of addedChildren) {
                const change = ensureChange(childId);
                change.addParents = addToSet(change.addParents, newTask.id);
            }
            for (const childId of removedChildren) {
                const change = ensureChange(childId);
                change.removeParents = addToSet(change.removeParents, newTask.id);
            }
        }
    }

    return Array.from(changeMap.values());
}

/**
 * Converts RelationshipChange objects to UpdateTaskParams format
 */
export function relationshipChangesToUpdateParams(changes: RelationshipChange[]): UpdateTaskParams[] {
    return changes.map(change => {
        const relations: { id: string; operation: "addChild" | "removeChild" | "addParent" | "removeParent" }[] = [];

        change.addParents?.forEach(id => relations.push({ id, operation: 'addParent' }));
        change.removeParents?.forEach(id => relations.push({ id, operation: 'removeParent' }));
        change.addChildren?.forEach(id => relations.push({ id, operation: 'addChild' }));
        change.removeChildren?.forEach(id => relations.push({ id, operation: 'removeChild' }));

        return {
            id: change.taskId,
            data: {},
            relations
        };
    }).filter(update => update.relations.length > 0);
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
export type CreateTaskParams = Partial<Task> & Omit<Task,
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
type RelationChange = { id: string, operation: "addChild" | "removeChild" | "addParent" | "removeParent" }
export type UpdateTaskParams = { id: string, data?: Partial<Task>, relations?: RelationChange[] };

//#endregion

//#endregion

