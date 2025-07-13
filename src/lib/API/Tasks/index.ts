// TODO Task API's need to take auth into consideration

import SupabaseTaskProvider from './SupabaseTaskProvider';
import BrowserTaskProvider from './BrowserTaskProvider';
import { Task } from './Task';
import type { ITaskProvider } from './types';

export * from './types';
export * from './Task'

// TODO TaskProvider should be moved to a +layout file as passed to $data
// so the most appropriate provider can be determined by the app
const APIPromise: Promise<ITaskProvider> = SupabaseTaskProvider.get();
export default APIPromise;


export async function updateRelationships(provider: ITaskProvider, oldTask: Task | null, newTask: Task | null) {
    if (!oldTask && newTask) {
        // Add new task to all relationships
        if (newTask.children.length > 0) {
            addAsParent(provider, newTask.id, newTask.children);
        }
        if (newTask.parents.length > 0) {
            addAsChild(provider, newTask.id, newTask.parents);
        }
    }
    else if (oldTask && !newTask) {
        // Remove oldTask from all relationships
        if (oldTask.children.length > 0) {
            removeAsParent(provider, oldTask.id, oldTask.children);
        }
        if (oldTask.parents.length > 0) {
            removeAsChild(provider, oldTask.id, oldTask.parents);
        }
    }
    else if (oldTask && newTask) {

        const addedParents = newTask.parents?.filter(x => !oldTask.parents?.includes(x));
        const removedParents = oldTask.parents?.filter(x => !newTask.parents?.includes(x));
        if (addedParents && addedParents.length > 0) {
            addAsParent(provider, newTask.id, addedParents);
        }
        if (removedParents && removedParents.length > 0) {
            removeAsParent(provider, newTask.id, removedParents);
        }

        const addedChildren = newTask.children?.filter(x => !oldTask.children?.includes(x));
        const removedChildren = oldTask.children?.filter(x => !newTask.children?.includes(x));
        if (addedChildren && addedChildren.length > 0) {
            addAsParent(provider, newTask.id, addedChildren);
        }
        if (removedChildren && removedChildren.length > 0) {
            removeAsParent(provider, newTask.id, removedChildren);
        }
    }
}

async function addAsParent(provider: ITaskProvider, parentId: string, childIds: string[]) {
    // Update each child to have this parent
    const childrenResult = await provider.readTasks(childIds);
    return childrenResult.match(
        async (children) => {
            const updates = children.flatMap(child => {
                if (!child.parents.includes(parentId)) {
                    return {
                        task: child,
                        updates: { parents: [...child.parents ?? [], parentId] }
                    };
                } else {
                    // No-op. Parent already assigned
                    return []
                }
            });
            await provider.updateTasks(updates);
        },
        (err) => {
            err.logError();
        });
}


async function addAsChild(provider: ITaskProvider, childId: string, parentIds: string[]) {
    // Update each parent to include this child
    for (const parentId of parentIds) {
        const parentResult = await provider.readTask(parentId);
        if (parentResult.isOk()) {
            const parent = parentResult.value;
            if (!parent.children.includes(childId)) {
                provider.updateTask(parent.id, { children: [...parent.children, childId] });
            } else {
                // No-op. Child already assigned
                console.warn("Attempted to add a node as a child of its own parent");
            }
        }
    }
}

async function removeAsParent(provider: ITaskProvider, parentId: string, childIds: string[]) {
    // Update each child to remove this parent
    for (const childId of childIds) {
        const childResult = await provider.readTask(childId);
        if (childResult.isOk()) {
            const child = childResult.value;
            if (child.parents.includes(parentId)) {
                provider.updateTask(child.id, { parents: child.parents.filter(x => x !== parentId) });
            } else {
                // No-op. Not a parent of target
                console.warn("Attempted to remove a node as a parent of a node that isn't its child");
            }
        }
    }
}

async function removeAsChild(provider: ITaskProvider, childId: string, parentIds: string[]) {
    // Update each parent to remove this child
    for (const parentId of parentIds) {
        const parentResult = await provider.readTask(parentId);
        if (parentResult.isOk()) {
            const parent = parentResult.value;
            if (parent.children.includes(childId)) {
                provider.updateTask(parent.id, { children: parent.children.filter(id => id !== childId) });
            } else {
                // No-op. Not a parent of target
                console.warn("Attempted to remove a node as a parent of a node that isn't its child");
            }
        }
    }
}