// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, Err, ArgumentError } from "$lib/Errors";
import type { Task, TaskData } from "./Task";
import type { BatchResult, Result } from "../types";
import { SyncQueue } from "../SyncQueue";




export interface ILocalTaskProvider {
  get(wrappedTasks?: ITasks): Promise<ITasksLocal>;
}
export type ITasks = ITaskCore & ITaskRelations & ITaskAdvancedFeatures
export type ITaskReverter = ITaskCoreResponseHandler
export type ITasksLocal = ITasks & ITaskExporter & { getSyncQueue: () => TaskSyncQueue | null };
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
>, ITaskReverter>;

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
  getChildrenOf(params: { taskOrId: string | Task }): Promise<Result<Task[], Err>>;
  /**
   * Gets all tasks that are waiting for `id`
   */
  getParentsOf(params: { taskOrId: string | Task }): Promise<Result<Task[], Err>>;
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
}

export interface ITaskExporter {
  exportData(params: { simplify?: boolean }): Promise<void>;
  importData(params: { data: string }): Promise<number>;
}


// #region Shared function parameter types

// All fields in the Omit<> become optional
export type CreateTaskParams = Partial<TaskData> & Omit<TaskData,
  | "id"
  | "created"
  | "last_edit"
  | "todays_task"
  | "status"
  | "parents"
  | "children"
// | "filepath"
>
export type PopulatedTaskDTO = Partial<Task> & Omit<Task, "id" | "completed" | "equals">
export type UpdateTaskParams = { taskOrId: string | Task, changes: Partial<Task> };
export type DeleteTaskParams = { taskOrId: string | Task, recursive?: boolean };

//#endregion