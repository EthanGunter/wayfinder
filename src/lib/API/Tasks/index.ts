import { Err } from '$lib/Errors';
import { extractBatchAndLogErrors } from '../types';
import { type TaskData } from './Task';
import type { ITasks, UpdateTaskParams } from './types';

export * from './types';
export * from './Task'

export interface RelationshipUpdate {
    oldTask: TaskData | null;
    newTask: TaskData | null;
}

export async function getRelationshipUpdates(provider: ITasks, updates: RelationshipUpdate | RelationshipUpdate[]): Promise<UpdateTaskParams[]> {
    // Normalize to array for consistent handling
    const updateArray = Array.isArray(updates) ? updates : [updates];

    // Collect all relationship changes to process in batches
    const parentAdditions: Map<string, Set<string>> = new Map(); // parentId -> Set of childIds
    const parentRemovals: Map<string, Set<string>> = new Map();
    const childAdditions: Map<string, Set<string>> = new Map(); // childId -> Set of parentIds
    const childRemovals: Map<string, Set<string>> = new Map();

    // Process each update to collect all changes
    for (const { oldTask, newTask } of updateArray) {
        if (!oldTask && newTask) {
            // Add new task to all relationships
            if (newTask.children.length > 0) {
                collectParentAdditions(parentAdditions, newTask.id, newTask.children);
            }
            if (newTask.parents.length > 0) {
                collectChildAdditions(childAdditions, newTask.id, newTask.parents);
            }
        }
        else if (oldTask && !newTask) {
            // Remove oldTask from all relationships
            if (oldTask.children.length > 0) {
                collectParentRemovals(parentRemovals, oldTask.id, oldTask.children);
            }
            if (oldTask.parents.length > 0) {
                collectChildRemovals(childRemovals, oldTask.id, oldTask.parents);
            }
        }
        else if (oldTask && newTask) {
            const addedParents = newTask.parents?.filter(x => !oldTask.parents?.includes(x));
            const removedParents = oldTask.parents?.filter(x => !newTask.parents?.includes(x));
            if (addedParents && addedParents.length > 0) {
                collectChildAdditions(childAdditions, newTask.id, addedParents);
            }
            if (removedParents && removedParents.length > 0) {
                collectChildRemovals(childRemovals, newTask.id, removedParents);
            }

            const addedChildren = newTask.children?.filter(x => !oldTask.children?.includes(x));
            const removedChildren = oldTask.children?.filter(x => !newTask.children?.includes(x));
            if (addedChildren && addedChildren.length > 0) {
                collectParentAdditions(parentAdditions, newTask.id, addedChildren);
            }
            if (removedChildren && removedChildren.length > 0) {
                collectParentRemovals(parentRemovals, newTask.id, removedChildren);
            }
        }
    }

    // Execute all updates in batches
    const relationUpdates = await Promise.all([
        getParentUpdates(provider, parentAdditions),
        processParentRemovals(provider, parentRemovals),
        processChildAdditions(provider, childAdditions),
        processChildRemovals(provider, childRemovals)
    ]);
    return relationUpdates.flat();
}

// Helper functions to collect changes
function collectParentAdditions(map: Map<string, Set<string>>, parentId: string, childIds: string[]) {
    if (!map.has(parentId)) {
        map.set(parentId, new Set());
    }
    childIds.forEach(childId => map.get(parentId)!.add(childId));
}

function collectParentRemovals(map: Map<string, Set<string>>, parentId: string, childIds: string[]) {
    if (!map.has(parentId)) {
        map.set(parentId, new Set());
    }
    childIds.forEach(childId => map.get(parentId)!.add(childId));
}

function collectChildAdditions(map: Map<string, Set<string>>, childId: string, parentIds: string[]) {
    if (!map.has(childId)) {
        map.set(childId, new Set());
    }
    parentIds.forEach(parentId => map.get(childId)!.add(parentId));
}

function collectChildRemovals(map: Map<string, Set<string>>, childId: string, parentIds: string[]) {
    if (!map.has(childId)) {
        map.set(childId, new Set());
    }
    parentIds.forEach(parentId => map.get(childId)!.add(parentId));
}

// Process batch updates
async function getParentUpdates(provider: ITasks, parentAdditions: Map<string, Set<string>>): Promise<UpdateTaskParams[]> {
    if (parentAdditions.size === 0) return [];

    // Get all child IDs that need updating
    const allChildIds = Array.from(parentAdditions.values()).flatMap(set => Array.from(set));
    const uniqueChildIds = [...new Set(allChildIds)];

    const childrenResult = await provider.getTasks({ ids: uniqueChildIds });
    const children = extractBatchAndLogErrors(childrenResult);

    const updates = children.flatMap(child => {
        // Find all parents that should be added to this child
        const parentsToAdd: string[] = [];
        parentAdditions.forEach((childIds, parentId) => {
            if (childIds.has(child.id) && !child.parents.includes(parentId)) {
                parentsToAdd.push(parentId);
            }
        });

        if (parentsToAdd.length > 0) {
            return {
                id: child.id,
                changes: { parents: [...child.parents, ...parentsToAdd] }
            };
        }
        return [];
    });

    return updates;

}

async function processParentRemovals(provider: ITasks, parentRemovals: Map<string, Set<string>>): Promise<UpdateTaskParams[]> {
    if (parentRemovals.size === 0) return [];

    // Get all child IDs that need updating
    const allChildIds = Array.from(parentRemovals.values()).flatMap(set => Array.from(set));
    const uniqueChildIds = [...new Set(allChildIds)];

    const childrenResult = await provider.getTasks({ ids: uniqueChildIds });
    return await childrenResult.match(
        async (childResults) => {
            const children = extractBatchAndLogErrors(childResults);

            const updates = children.flatMap(child => {
                // Find all parents that should be removed from this child
                const parentsToRemove: string[] = [];
                parentRemovals.forEach((childIds, parentId) => {
                    if (childIds.has(child.id) && child.parents.includes(parentId)) {
                        parentsToRemove.push(parentId);
                    }
                });

                if (parentsToRemove.length > 0) {
                    return {
                        id: child.id,
                        changes: { parents: child.parents.filter(p => !parentsToRemove.includes(p)) }
                    };
                }
                return [];
            });

            // TODO Return as collection
            return updates;
        },
        (err) => {
            Err.UNHANDLED(err);
        }
    );
}

async function processChildAdditions(provider: ITasks, childAdditions: Map<string, Set<string>>): Promise<UpdateTaskParams[]> {
    if (childAdditions.size === 0) return [];

    // Get all parent IDs that need updating
    const allParentIds = Array.from(childAdditions.values()).flatMap(set => Array.from(set));
    const uniqueParentIds = [...new Set(allParentIds)];

    const parentsResult = await provider.getTasks({ ids: uniqueParentIds });
    return await parentsResult.match(
        async (parentResults) => {
            const parents = extractBatchAndLogErrors(parentResults);
            const updates = parents.flatMap(parent => {
                // Find all children that should be added to this parent
                const childrenToAdd: string[] = [];
                childAdditions.forEach((parentIds, childId) => {
                    if (parentIds.has(parent.id) && !parent.children.includes(childId)) {
                        childrenToAdd.push(childId);
                    }
                });

                if (childrenToAdd.length > 0) {
                    return {
                        id: parent.id,
                        changes: { children: [...parent.children, ...childrenToAdd] }
                    };
                }
                return [];
            });

            return updates;
        },
        (err) => {
            Err.UNHANDLED(err);
        }
    );
}

async function processChildRemovals(provider: ITasks, childRemovals: Map<string, Set<string>>): Promise<UpdateTaskParams[]> {
    if (childRemovals.size === 0) return [];

    // Get all parent IDs that need updating
    const allParentIds = Array.from(childRemovals.values()).flatMap(set => Array.from(set));
    const uniqueParentIds = [...new Set(allParentIds)];

    const parentsResult = await provider.getTasks({ ids: uniqueParentIds });
    return await parentsResult.match(
        async (parentResults) => {
            const parents = extractBatchAndLogErrors(parentResults);
            const updates = parents.flatMap(parent => {
                // Find all children that should be removed from this parent
                const childrenToRemove: string[] = [];
                childRemovals.forEach((parentIds, childId) => {
                    if (parentIds.has(parent.id) && parent.children.includes(childId)) {
                        childrenToRemove.push(childId);
                    }
                });

                if (childrenToRemove.length > 0) {
                    return {
                        id: parent.id,
                        changes: { children: parent.children.filter(c => !childrenToRemove.includes(c)) }
                    };
                }
                return [];
            });

            return updates;
        },
        (err) => {
            Err.UNHANDLED(err);
        }
    );
}