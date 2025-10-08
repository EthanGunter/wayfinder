import type { NotFoundError, Err, ArgumentError, NotAuthorizedError, InvalidStateError } from "$domain/errors";
import { ParseError } from "$domain/errors";
import yaml from 'js-yaml'
import { v4 } from "uuid";
import { err, ok, type Result } from "$domain/result";
import type { User } from "./user";


//#region Task Interface and Utilities

export interface Task {
    id: string,
    userAuthId: string,
    // filepath?: string // TODO I'd eventually like to make Wayfinder local-plain-text-first, but that's a future feature
    title: string,
    content?: string,
    status: TaskStatus,
    todaysTask?: Date, // Time of assignment
    priority?: number,
    /** 
     * Tasks that depend on this one's completion.
    */
    parents: string[]
    /** 
     * This task's prequisite[s].
    */
    children: string[]
    created: Date,
    lastEdit: Date,
}

export enum TaskStatus {
    incomplete = 0,
    complete = 1,
}

export function isTask(value: any): value is Task {
    return typeof value === 'object'
        && typeof value.id === 'string'
        // && typeof value.filepath === 'string'
        && typeof value.title === 'string'
        && typeof value.created === 'string'
        && typeof value.last_edit === 'string'
        && (value.todays_task === undefined || typeof value.todays_task === 'string')
        && typeof value.parents === 'object'
        && typeof value.children === 'object'
        ;
}

export function isTaskCompleted(task: Task): boolean {
    return task.status === TaskStatus.complete;
}

export function createTask(params: CreateTaskParams): Task {
    const {
        id,
        userAuthId: user_id,
        title,
        content,
        status = TaskStatus.incomplete,
        todaysTask: todays_task,
        priority = 0,
        created = new Date(),
        lastEdit: last_edit = new Date(),
        parents = [],
        children = [],
    } = params;
    return {
        id: id ?? v4(),
        userAuthId: user_id,
        title: title,
        content,
        status,
        todaysTask: todays_task,
        priority,
        created,
        lastEdit: last_edit,
        parents,
        children,
    };
}

export function taskEquals(a: Task, b: Task, ignoreId: boolean = false): boolean {
    if (!ignoreId && a.id !== b.id) return false;
    return a.userAuthId === b.userAuthId
        && a.title === b.title
        && a.content === b.content
        && a.status === b.status
        && a.priority === b.priority
        && a.parents === b.parents
        && a.children === b.children
        && a.created === b.created;
    // && a.last_edit === b.last_edit // This might cause change between checks on server and local
}

export function populateTaskDTO(dto: CreateTaskParams): PopulatedTaskDTO {
    const populated: PopulatedTaskDTO = {
        id: dto.id ?? v4(),
        userAuthId: dto.userAuthId,
        priority: dto.priority ?? 0,
        title: dto.title,
        content: dto.content,
        // filepath: dto.filepath ?? `${dto.title}.md`,
        status: dto.status ?? TaskStatus.incomplete,
        todaysTask: dto.todaysTask,
        created: dto.created ?? new Date(),
        lastEdit: dto.lastEdit ?? new Date(),
        parents: dto.parents ?? [],
        children: dto.children ?? [],
    };
    if (!dto.id)
        delete (populated as any).id;
    return populated;
}

export function toMarkdown(task: Task): string {
    const { content, /* filepath, */ ...meta } = task;
    return `---\n${yaml.dump(meta)}---\n${content ?? ''}`;
}

/**
 * @error {@link ParseError} if the yaml frontmatter can't be read. This doesn't guarantee that the data is correct, just that it's legal yaml.
 */
export function fromMarkdown(md: string, filepath: string): Result<Task, ParseError> {
    const match = md.match(/^---\n([\s\S]+?)---\n([\s\S]*)$/);
    if (!match) {
        return err(new ParseError(md, "TaskNode"));
    }
    const meta = yaml.load(match[1]) as Omit<Task, 'content'>;
    return ok({ ...(meta as any), filepath, content: match[2].trim() });
}

//#endregion


//#region API Interfaces

// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

// Remote vs Local interfaces are distinct; do not blend contracts
export interface ITasks {
    /**
    * Creates a new task with the given data
    * @returns The new task's generated ID
    */
    /* TODO:sync/tasks/refactor An example of divergence between the client-side and remote side APIs. The server should return id updates, 
    the client should frankly return void, since we're using a subscription-based data model */
    createTask(params: { createDetail: CreateTaskParams }): Promise<Result<{ oldId: string, newId: string, affectedTasks: Task[] }, NotAuthorizedError | InvalidStateError>>;
    createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<{ updatedIds: Map<string, string>, affectedTasks: Task[] }, NotAuthorizedError>>;
    /**
     * Fetches a task's data by its ID
     */
    getTask(params: { id: string }): Promise<Result<Task, NotFoundError | NotAuthorizedError>>;
    getTasks(params: { ids: string[] }): Promise<Result<Task[], NotFoundError | NotAuthorizedError>>;
    getAllUserTasks(params: { userId: string }): Promise<Result<Task[], NotFoundError | NotAuthorizedError>>;
    /**
     * @param task can be passed as an id
     */
    updateTask(params: UpdateTaskParams): Promise<Result<Task, NotAuthorizedError>>;
    updateTasks(params: { updates: UpdateTaskParams[] }): Promise<Result<Task[], NotAuthorizedError>>;

    deleteTask(params: { id: string }): Promise<Result<void, NotAuthorizedError>>;
    deleteTasks(params: { ids: string[] }): Promise<Result<void, NotAuthorizedError>>;

    // TODO:sync migrate un-synced user data
    // changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<Result<Task[], NotAuthorizedError>>;

    /**
     * Finds all tasks that must be completed before `id`
     */
    getChildrenOf(params: { id: string }): Promise<Result<Task[], Err>>;
    /**
     * Gets all tasks that are waiting for `id`
     */
    getParentsOf(params: { id: string }): Promise<Result<Task[], Err>>;
    /**
     * Gets all tasks that nothing depends on
     */
    getRootTasks(): Promise<Result<Task[], Err>>;

    /**
     * Gets all tasks that are on the "Today's List"
     */
    getTodaysTasks(): Promise<Result<Task[], Err>>;
    /**
     * Gets the top N tasks based on priority
     */
    getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): Promise<Result<Task[], Err>>;

    searchTasks(searchTerm: string): Promise<Task[]>;
};

export interface ITasksLocal {
    createTask(params: { createDetail: CreateTaskParams }): Promise<Result<string, InvalidStateError>>;
    createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<string[], InvalidStateError | ArgumentError>>;
    handleCreateTasksResponse(response: Result<{ updatedIds: Map<string, string>, affectedTasks: Task[] }, { idsToDelete: string[], error: NotAuthorizedError }>): Promise<void>;

    /**
     * Fetches a task's data by its ID
     */
    getTask(params: { id: string }): Promise<Result<Task, NotFoundError | NotAuthorizedError>>;
    getTasks(params: { ids: string[] }): Promise<Result<Task[], NotFoundError | NotAuthorizedError>>;
    getAllUserTasks(params: { userId: string }): Promise<Result<Task[], NotFoundError | NotAuthorizedError>>;

    /**
     * @param task can be passed as an id
     */
    updateTask(params: UpdateTaskParams): Promise<Result<Task, NotAuthorizedError>>;
    updateTasks(params: { updates: UpdateTaskParams[] }): Promise<Result<Task[], NotAuthorizedError>>;
    handleUpdateTasksResponse(response: Result<void, { oldState: { updatedId: string, task: Task }[], error: NotAuthorizedError }>): Promise<void>;

    deleteTask(params: { id: string }): Promise<Result<void>>;
    deleteTasks(params: { ids: string[] }): Promise<Result<void>>;
    handleDeleteTasksResponse(response: Result<void, { oldState: Task[], error: NotAuthorizedError }>): Promise<void>;

    handleMigrateResponse(response: Result<void, { oldUserID: string, newUserID: string, error: NotAuthorizedError }>): Promise<void>;

    /**
     * Finds all tasks that must be completed before `id`
     */
    getChildrenOf(params: { id: string }): Promise<Result<Task[], Err>>;
    /**
     * Gets all tasks that are waiting for `id`
     */
    getParentsOf(params: { id: string }): Promise<Result<Task[], Err>>;
    /**
     * Gets all tasks that nothing depends on
     */
    getRootTasks(): Promise<Result<Task[], Err>>;

    /**
     * Gets all tasks that are on the "Today's List"
     */
    getTodaysTasks(): Promise<Result<Task[], Err>>;
    /**
     * Gets the top N tasks based on priority
     */
    getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): Promise<Result<Task[], Err>>;

    searchTasks(searchTerm: string): Promise<Task[]>;

    /**
     * @param userId Used to subscribe to ALL tasks for a user
     * @param ids For tracking only specific tasks
     * @param depth the recursive depth of ancestor/descendants to include in the subscription
     * @param onInitialize Called immediately on subscription. Provides the initial state of data
     * @param onChange Called everytime a task is modified. 
     * @return unsubscribe function
   */
    subscribeTasks(
        params:
            | {
                userId: string;
                ids?: never;
                onInitialize: (tasks: Task[]) => void;
                onChange: (changes: TaskDelta[]) => void;
            }
            | {
                ids: string[];
                ancestorDepth: number;
                descendantDepth: number;
                userId?: never;
                onInitialize: (tasks: Task[]) => void;
                onChange: (changes: TaskDelta[]) => void;
            }
    ): () => void;

    exportData(): Promise<string>;
    importData(params: { data: string, mode?: "add" | "replace" | "attemptMerge" }): Promise<number>;

    hydrateForUser(params: { user: User }): Promise<void>;
};

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

