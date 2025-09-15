// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, Err, ArgumentError } from "$lib/Errors";
import type { Task } from "./Task";
import type { BatchResult, Result } from "../types";
import { SyncQueue } from "../SyncQueue";




export interface ILocalTaskProvider {
  get(wrappedTasks?: ITasks): Promise<ILocalTasks>;
}
export type ITasks = ITaskCore & ITaskRelations & ITaskAdvancedFeatures
export type ITaskReverter = ITaskCoreResponseHandler
export type ILocalTasks = ITasks & ITaskExporter & {
  getSyncQueue: () => TaskSyncQueue | null, hasRemote(): boolean;
};
export type TaskSyncQueue = SyncQueue<Omit<ITasks,
  | "getAllUserTasks"
  | "getChildrenOf"
  | "getParentsOf"
  | "getPrioritizedTasks"
  | "getRootTasks"
  | "getTask"
  | "getTasks"
  | "getTodaysTasks"
  | "searchTasks"
  | "subscribeTasks"
>, ITaskReverter>;
/**
 * Delta describing a task change. Creation: oldTask=null. Deletion: newTask=null.
 */
export type TaskDelta = { oldTask: Task | null; newTask: Task | null };



/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskCore {
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  createTask(params: { createDetail: CreateTaskParams }): Promise<Result<Task>>;
  createTasks(params: { createDetails: CreateTaskParams[] }): Promise<BatchResult<Task, ArgumentError>>;
  /**
   * Fetches a task's data by its ID
   */
  getTask(params: { id: string }): Promise<Result<Task, NotFoundError>>;
  getTasks(params: { ids: string[] }): Promise<BatchResult<Task, NotFoundError>>;
  getAllUserTasks(params: { userId: string }): Promise<BatchResult<Task, NotFoundError>>;
  /**
   * @param task can be passed as an id
   */
  updateTask(params: UpdateTaskParams): Promise<Result<Task>>;
  updateTasks(params: { updates: UpdateTaskParams[] }): Promise<BatchResult<Task>>;

  deleteTask(params: DeleteTaskParams): Promise<Result<void>>;
  deleteTasks(params: { deleteArgs: DeleteTaskParams[] }): Promise<Result<void>>;

  changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<BatchResult<Task>>;
}

// TODO Singular api will likely just wrap multi api for convenience, no need for more handlers
export interface ITaskCoreResponseHandler {
  handleCreateTasksResponse(response: Result<void, { createdIds: string[] }>): Promise<void>;
  handleUpdateTasksResponse(response: Result<void, { oldState: { updatedId: string, task: Task }[] }>): Promise<void>;
  handleDeleteTasksResponse(response: Result<void, { oldState: Task[] }>): Promise<void>;
  handleChangeOwnershipResponse(response: Result<void, { oldUserID: string, newUserID: string }>): Promise<void>;
}

export interface ITaskRelations {
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
}

export interface ITaskAdvancedFeatures {
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

}


export interface ITaskExporter {
  exportData(params: { simplify?: boolean }): Promise<void>;
  importData(params: { data: string }): Promise<number>;
}


// #region Shared function parameter types

// All fields in the Omit<> become optional
export type CreateTaskParams = Partial<Task> & Omit<Task,
  | "id"
  | "created"
  | "last_edit"
  | "todays_task"
  | "status"
  | "parents"
  | "children"
// | "filepath"
>
export type PopulatedTaskDTO = Partial<Task> & Omit<Task, "id">
type RelationChange = { id: string, operation: "addChild" | "removeChild" | "addParent" | "removeParent" }
export type UpdateTaskParams = { id: string, data?: Partial<Omit<Task, "children" | "parents">>, relations?: RelationChange[] };
export type DeleteTaskParams = { id: string, recursive?: boolean };

//#endregion