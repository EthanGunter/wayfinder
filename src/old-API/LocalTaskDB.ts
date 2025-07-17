import {Task} from '$lib/API/Tasks/Task';
import { Storage } from '@ionic/storage';
import type { GetTasksResponse } from './TaskDBResponses';
import FuzzySet from 'fuzzyset'
import { Capacitor } from '@capacitor/core';

//#region Declaration

class LocalTaskDB extends Dexie {
    tasks!: Table<Task>;
    todaysTasks!: Table<{ id: string, priority: number }>;

    constructor(version: number) {
        super(TASK_STORE_NAME);
        this.version(version).stores({
            tasks: `id, title, completed, *parentIds`, // search keys // TODO would be a good idea to use nameof here https://stackoverflow.com/questions/50470025/nameof-keyword-in-typescript
            todaysTasks: `id, priority`
        });
        this.tasks.mapToClass(Task);
        console.log("DataNodeDB constructed version:", version);
    }
}

let db: LocalTaskDB;

// TODO as tedious as it will be, db should be wrapped in an API instead of exposed publicly,
// if for no other reason, handling bouncing
db = new LocalTaskDB(1);
db.open().then(() => console.log("Opened db", db)).catch(() => { throw new Error("Failed to open db") });

// db.tasks.toArray().then(tasks => tasks.forEach(t => updateTask(t.id, { ...t, tags:[] })));
//#endregion


//#region Public API
//TODO These should probably be debounced...
export async function getTodaysTasks(): Promise<Task[]> {
    let ids: string[];
    if (db instanceof LocalTaskDB) {
        ids = (await db.todaysTasks.toArray()).map(item => item.id)
    } else {
        throw new Error("Not implemented");
    }
    const fetchResult = await getTasks(ids);
    fetchResult.failedTasks.forEach(taskId => {
        db.todaysTasks.delete(taskId);
    });
    const tasks = fetchResult.tasks.filter(t => {
        if (t.completed) {
            console.log("Removing completed task from todays list:", t);
            // TODO Mark for deletion rather than immediate extermination
            db.todaysTasks.delete(t.id);
            return false;
        }
        else return true;
    });
    return tasks;

}
export async function setTodaysTask(id: string, priority: number): Promise<void> {
    if (db instanceof LocalTaskDB) {
        await db.todaysTasks.add({ id, priority: priority });
    } else {
        throw new Error("Not implemented");
    }
}
export async function removeTodaysTask(task: Task): Promise<void> {
    if (db instanceof LocalTaskDB) {
        await db.todaysTasks.delete(task.id);
    } else {
        throw new Error("Not implemented");
    }
}

export async function getRoots(): Promise<Task[]> {
    if (db instanceof LocalTaskDB) {
        return await db.tasks.filter(t => t.parentIds.length === 0).toArray();
    } else {
        throw new Error("Not implemented");
    }
}
export async function getTask(id: string): Promise<Task | undefined> {
    let task: Task | undefined;
    if (db instanceof LocalTaskDB) {
        task = await db.tasks.get(id);
    } else {
        throw new Error("Not implemented");
    }
    return task;
}
export async function getTasks(ids: string[]): Promise<GetTasksResponse> {
    if (ids.length === 0) return { tasks: [], failedTasks: [] };
    let possibleTasks: (Task | undefined)[];
    if (db instanceof LocalTaskDB) {
        possibleTasks = await db.tasks.bulkGet(ids);
    } else {
        throw new Error("Not implemented");
    }
    const failedTasks: string[] = [];
    const definedTasks = possibleTasks.filter((t, ind) => {
        if (t) return true;
        else {
            failedTasks.push(ids[ind]);
            console.warn(`Attempted to retrieve non-existant task: ${ids[ind]}`);
        }
    }) as Task[];

    return {
        tasks: definedTasks,
        failedTasks
    };
}

export async function searchTasks(searchTerm: string): Promise<Task[]> {
    if (db instanceof LocalTaskDB) {
        if (searchTerm.length === 0) return [];
        const titledTasks: [string, Task][] = (await db.tasks.toArray()).map(t => [t.title, t]);
        const map = new Map<string, Task>(titledTasks);
        const searchEngine = FuzzySet(titledTasks.map(x => x[0])); // TODO This seems dangerously slow...

        /* OLD (BAD) METHOD
        const searchTerms = searchTerm.split(" ");
    
        const searchResults = await db.tasks.filter((t: Task) => {
            for (const term of searchTerms) {
                const reg = new RegExp(`.*(?=${term}).*`, "i");
                if (reg.test(t.title) || t.description && reg.test(t.description)) {
                    return true;
                }
            }
            return false;
        }).toArray();
        */

        const searchResults = searchEngine.get(searchTerm, undefined, 0)?.sort((a, b) => b[0] - a[0])?.map(item => item[1]) || [];
        return searchResults.map(s => map.get(s)).filter(x => x !== undefined) as Task[];
    } else {
        throw new Error("Not implemented");
    }
}

export async function createTask(task?: Task, parents?: Task[] | string[], children?: Task[] | string[]): Promise<Task> {
    if (!task) {
        task = new Task("New Task");
    }
    if (parents) task = await setParents(task, parents);
    if (children) task = await setChildren(task, children);

    // Add to localDB    
    if (db instanceof LocalTaskDB) {
        await db.tasks.add(task, task.id);
    } else {
        throw new Error("Not implemented");
    }
    await updateAncestorCompletion(task);
    return task;
}

/**@returns I honestly don't know. I'm just forwarding Dexie's return value */
export async function updateTask(task: Task | string, update: Partial<Task>): Promise<number> { // I have no idea what this is returning :D
    if (!(task instanceof Task)) {
        task = await taskFromID(task);
    }

    // TODO This causes issues if the task item is updated before being passed to this API
    // It's an unecessary optimization when no server is in use, so it's fine to skip for now
    // // Make sure there is actually something to update
    // Object.entries(update).forEach(([key, value]) => {
    //     if (value === task[key as keyof Task]) {
    //         delete update[key as keyof Task];
    //     }
    // });

    if (Object.keys(update).length === 0) {
        console.warn("Aborted changless update:", task, update, new Error().stack);
        return 0;
    }
    let updateResponse: number;
    if (db instanceof LocalTaskDB) {
        updateResponse = await db.tasks.update(task, { ...update });
    } else {
        throw new Error("Not implemented");
    }

    if (update.parentIds !== undefined) {
        const addedParentsIds = update.parentIds.filter(item => !task.parentIds.includes(item));
        const removedParentsIds = task.parentIds.filter(item => !update.parentIds!.includes(item));
        const addedParents = (await getTasks(addedParentsIds)).tasks
        const removedParents = (await getTasks(removedParentsIds)).tasks

        for (const parent of addedParents) {
            if (!parent.childIds.includes(task.id)) {
                if (update.completed == false || (update.completed !== true && task.completed === false)) {
                    updateTask(parent, { childIds: [task.id, ...(parent?.childIds ?? [])], completed: false });
                } else {
                    updateTask(parent, { childIds: [task.id, ...(parent?.childIds ?? [])] });
                }
            }
        };
        for (const parent of removedParents) {
            updateTask(parent, { childIds: parent?.childIds?.filter(child => child !== task.id) ?? [] });
        }
    }

    if (update.childIds !== undefined) {
        const addedChildrenIds = update.childIds.filter(item => !task.childIds.includes(item));
        const removedChildrenIds = task.childIds.filter(item => !update.childIds!.includes(item));
        const addedChildren = (await getTasks(addedChildrenIds)).tasks
        const removedChildren = (await getTasks(removedChildrenIds)).tasks

        for (const child of addedChildren) {
            if (!child.parentIds.includes(task.id)) {
                updateTask(child, { parentIds: [task.id, ...(child?.parentIds ?? [])] });
            };
        }
        for (const child of removedChildren) {
            updateTask(child, { parentIds: child?.parentIds?.filter(parent => parent !== task.id) ?? [] });
        };
    }

    if (update.completed !== undefined || update.completion !== undefined) {
        updateAncestorCompletion(task);
    }
    return updateResponse;
}

export async function deleteTask(task: Task | string, deleteSubtree: boolean = false): Promise<void> {
    if (!(task instanceof Task)) task = await taskFromID(task);

    const parents: Task[] = await task.getParents();
    const children: Task[] = await task.getChildren();

    parents.forEach(parent => {
        parent.childIds = parent.childIds.filter(child => child !== task.id); // remove this task from parent's child list

        if (!deleteSubtree) {
            parent.childIds.push(...task.childIds); // Add this task's children to its parent
        }

        updateTask(parent, { childIds: parent.childIds }); // Update the parent in the DB
    });

    children.forEach(child => {
        if (deleteSubtree) {
            deleteTask(child.id, true); // Recursively delete all children
        } else {
            child.parentIds = child.parentIds.filter(parentId => parentId !== task.id); // Remove this task from child's parent list
            child.parentIds.push(...task.parentIds) // Add this task's parent(s) as the child's parent(s)
        }

        updateTask(child, { parentIds: child.parentIds }); // Update the child in the DB
    });

    updateAncestorCompletion(task);
    if (db instanceof LocalTaskDB) {
        return await db.tasks.delete(task.id);
    } else {
        throw new Error("Not implemented");
    }
}
export async function deleteTasks(ids: string[]): Promise<void> {
    // TODO
    console.warn("deleteTasks() fails to update relationships, and will break the graph...");

    if (db instanceof LocalTaskDB) {
        return await db.tasks.bulkDelete(ids);
    } else {
        throw new Error("Not implemented");
    }
}

export async function exportData(simplify?: boolean): Promise<string> {
    var tasks: Task[];
    if (db instanceof LocalTaskDB) {
        tasks = await db.tasks.toArray();
    } else {
        throw new Error("Not implemented");
    }
    if (simplify) {
        tasks = tasks.map(t => ({
            title: t.title,
            parents: t.parentIds.length > 0 ? t.parentIds.map(id => tasks.find(task => task.id === id)?.title) : undefined,
            children: t.childIds.length > 0 ? t.childIds.map(id => tasks.find(task => task.id === id)?.title) : undefined,
        })) as any;
    } else {
        tasks = tasks.map(t => ({
            ...t,
            parents: undefined,
            children: undefined
        })) as any
    }
    const json = JSON.stringify(tasks);
    return json;
}
export async function importData(data: string): Promise<number> {
    const tasks = JSON.parse(data);
    console.log(tasks);

    if (db instanceof LocalTaskDB) {
        await db.tasks.bulkPut(tasks);
    } else {
        throw new Error("Not implemented");
    }
    return tasks.length;
}

export async function getPrioritizedTasks(numTasks: number/* , weights: WeightParams = {
    deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
} */): Promise<Task[]> {
    let taskArray: Task[];
    if (db instanceof LocalTaskDB) {
        taskArray = await db.tasks.toArray();
    } else {
        throw new Error("Not implemented");
    }
    const roots: Task[] = taskArray.filter(t => t.parentIds.length === 0);
    const tasksMap: Map<string, Task> = new Map(taskArray.map(t => [t.id, t] as [string, Task]));

    const sorter = (a: Task | undefined, b: Task | undefined) => {
        if (!a) return -1;
        else if (!b) return 1;
        else return b.priority - a.priority
    };

    let todoList: Task[] = [];

    const inOrderTraversalAssignment = (task: Task) => {
        if (todoList.length === numTasks/*  || task.tags?.includes('disabled') */)
            return; // stop searching once all tasks are acquired

        // TODO this lil check right here may not be ideal... user testing will tell
        if (task.childIds.length === 0) { // is leaf node
            if (!task.completed) // and it's not already completed
                todoList.push(task); // add to todolist
        }
        else { // continue for all children, starting with highest priority
            const children: (Task | undefined)[] = task.childIds.map(child => tasksMap.get(child)).sort(sorter)
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (!child) continue;

                if (!child.completed) {
                    inOrderTraversalAssignment(child);
                }
            }

            if (children.every(c => !c || c.completed) && !task.completed)
                todoList.push(task);
        }
    }

    roots.sort(sorter)
    for (let i = 0; i < roots.length; i++) {
        if (todoList.length === numTasks)
            return todoList;

        const root = roots[i];
        inOrderTraversalAssignment(root);
    }

    return todoList;
}
//#endregion


//#region Private functions

async function taskFromID(id: string): Promise<Task> {
    const task = await getTask(id);
    if (!task) {
        throw Error(`Task not found: ${id}`);
    }
    else return task;
}

async function updateAncestorCompletion(task: Task | string) {
    if (!(task instanceof Task)) {
        task = await taskFromID(task);
    }

    if (task?.parentIds && task.parentIds.length > 0) {
        const parents = (await getTasks(task.parentIds)).tasks;
        for (const parent of parents) {
            let completion = 0;
            let completed: boolean | undefined = false;
            const children = (await getTasks(parent.childIds)).tasks;
            if (children.length > 0) {
                children.forEach(c => completion += c.completed ? 1 : 0);
                completion = (completion / children.length) * 100;
            } else {
                completion = 0;
            }

            await updateTask(parent, { completion, completed }); // This will trigger a recursive heirarchy update
        }
    }
}

async function setParents(task: Task, parents: Task[] | string[]): Promise<Task> {
    if (typeof parents[0] == "string") { parents = (await getTasks(parents as string[])).tasks; }
    parents = parents as Task[];

    task.parentIds = parents.map(p => p.id);
    parents.forEach(parent => {
        updateTask(parent, { childIds: [task.id, ...parent.childIds] });
    })
    return task;
}

async function setChildren(task: Task, children: Task[] | string[]): Promise<Task> {
    if (typeof children[0] == "string") { children = (await getTasks(children as string[])).tasks; }
    children = children as Task[];

    task.childIds = children.map(p => p.id);
    children.forEach(child => {
        updateTask(child, { parentIds: [task.id, ...child.parentIds] });
    })
    return task;
}

//#endregion