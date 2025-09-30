// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, Err, ArgumentError, NotAuthorizedError, InvalidStateError, Result, BatchResult } from "$lib/Errors";
import type { Task } from "./Task";
import type { User } from "../Auth/User";

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
  getTasks(params: { ids: string[] }): Promise<BatchResult<Task, NotFoundError | NotAuthorizedError>>;
  getAllUserTasks(params: { userId: string }): Promise<BatchResult<Task, NotFoundError | NotAuthorizedError>>;
  /**
   * @param task can be passed as an id
   */
  updateTask(params: UpdateTaskParams): Promise<Result<Task, NotAuthorizedError>>;
  updateTasks(params: { updates: UpdateTaskParams[] }): Promise<BatchResult<Task, NotAuthorizedError>>;

  deleteTask(params: { id: string }): Promise<Result<void, NotAuthorizedError>>;
  deleteTasks(params: { ids: string[] }): Promise<Result<void, NotAuthorizedError>>;

  // TODO:sync migrate un-synced user data
  // changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<BatchResult<Task, NotAuthorizedError>>;

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
  createTask(params: { createDetail: CreateTaskParams }): Promise<Result<void, InvalidStateError>>;
  createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<void, InvalidStateError | ArgumentError>>;
  handleCreateTasksResponse(response: Result<{ updatedIds: Map<string, string>, affectedTasks: Task[] }, { idsToDelete: string[], error: NotAuthorizedError }>): Promise<void>;

  /**
   * Fetches a task's data by its ID
   */
  getTask(params: { id: string }): Promise<Result<Task, NotFoundError | NotAuthorizedError>>;
  getTasks(params: { ids: string[] }): Promise<BatchResult<Task, NotFoundError | NotAuthorizedError>>;
  getAllUserTasks(params: { userId: string }): Promise<BatchResult<Task, NotFoundError | NotAuthorizedError>>;

  /**
   * @param task can be passed as an id
   */
  updateTask(params: UpdateTaskParams): Promise<Result<Task, NotAuthorizedError>>;
  updateTasks(params: { updates: UpdateTaskParams[] }): Promise<BatchResult<Task, NotAuthorizedError>>;
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
  | "last_edit"
  | "todays_task"
  | "status"
  | "parents"
  | "children"
// | "filepath"
>
export type PopulatedTaskDTO = Partial<Task> & Omit<Task, "id">
type RelationChange = { id: string, operation: "addChild" | "removeChild" | "addParent" | "removeParent" }
export type UpdateTaskParams = { id: string, data?: Partial<Task>, relations?: RelationChange[] };

//#endregion

