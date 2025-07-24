// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, Err } from "$lib/Errors";
import type { Task, TaskData } from "./Task";
import type { BatchResult, Result } from "../types";

// All fields in the Omit<> become optional
export type CreateTaskDTO = Partial<TaskData> & Omit<TaskData,
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



export interface ILocalTaskProvider {
  get(remoteTasks?: ITaskAPI): Promise<ITaskAPI & ITaskExporter>;
  close(): Promise<void>
}
export type ITaskAPI = ITaskCore & ITaskRelations & ITaskAdvancedFeatures
export type ITaskReverter = ITaskCoreResponseHandler

/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskCore {
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  // TODO-test: sets up relationships if parent(s) or children are populated
  createTask(params: { createDetail: CreateTaskDTO }): Promise<Result<Task>>;
  createTasks(params: { createDetails: CreateTaskDTO[] }): Promise<BatchResult<Task>>;
  /**
   * Fetches a task's data by its ID
   */
  getTask(params: { id: string }): Promise<Result<Task, NotFoundError>>;
  getTasks(params: { ids: string[] }): Promise<BatchResult<Task, NotFoundError>>;
  getAllUserTasks(params: { userId: string }): Promise<BatchResult<Task, NotFoundError>>;
  /**
   * @param task can be passed as an id
   */
  updateTask(params: { taskOrId: string | Task, changes: Partial<Task> }): Promise<Result<Task>>;
  updateTasks(params: { updateList: { taskOrId: string | Task, changes: Partial<Task> }[] }): Promise<BatchResult<Task>>;

  deleteTask(params: { id: string, recursive?: boolean }): Promise<Result<void>>;
  deleteTasks(params: { deleteList: { id: string, recursive?: boolean }[] }): Promise<Result<void>>;

  changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<BatchResult<Task>>;
}

// TODO Singular api will likely just wrap multi api for convenience, no need for more handlers
export interface ITaskCoreResponseHandler {
  // handleCreateTaskResponse(response: Result<void,{ createdId: string }>): Promise<void>;
  handleCreateTasksResponse(response: Result<void, { createdIds: string[] }>): Promise<void>;
  // handleUpdateTaskResponse(response: Result<void,{ task: string | Task, changes: Partial<Task> }>): Promise<void>;
  handleUpdateTasksResponse(response: Result<void, { updateList: { task: string | Task, changes: Partial<Task> }[] }>): Promise<void>;
  // handleDeleteTaskResponse(response: Result<void,{ id: string, recursive?: boolean }>): Promise<void>;
  handleDeleteTasksResponse(response: Result<void, { deleteList: { id: string, recursive?: boolean }[] }>): Promise<void>;
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
