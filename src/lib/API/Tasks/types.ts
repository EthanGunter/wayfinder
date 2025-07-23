// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, ParseError, Err } from "$lib/Errors";
import type { Result, ResultAsync } from "neverthrow";
import type { Task } from "./Task";

// All fields in the Omit<> become optional
export type CreateTaskDTO = Partial<Task> & Omit<Task,
  | "id"
  | "created"
  | "last_edit"
  | "completed"
  | "todays_task"
  | "status"
  | "parents"
  | "children"
// | "filepath"
>
export type PopulatedTaskDTO = Partial<Task> & Omit<Task, "id" | "completed">

// TODO Move somewhere more appropriate
export interface IProvider<T> {
  get(): Promise<T>;
  close(): Promise<void>
}
export interface IWrappedProvider<WrappedT, ProviderT> {
  get(internal: WrappedT): Promise<WrappedT & ProviderT>;
  close(): Promise<void>
}

// TODO narrow error types once concrete classes are implemented
// TODO break into more specific interfaces
export type ITaskProvider = ITaskCRUDProvider & ITaskRelationProvider & IAdvancedTaskProvider

// TODO Should plural functions return an array of errors?
/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskCRUDProvider {
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  // TODO-test: sets up relationships if parent(s) or children are populated
  createTask(task: CreateTaskDTO): Promise<Result<Task, Err>>;
  createTasks(tasks: CreateTaskDTO[]): Promise<Result<Task[], Err>>;
  /**
   * Fetches a task's data by its ID
   */
  readTask(id: string): Promise<Result<Task, NotFoundError | Err>>;
  readTasks(ids: string[]): Promise<Result<Task[], NotFoundError | Err>>;
  /**
   * @param task can be passed as an id
   */
  updateTask(task: string | Task, updates: Partial<Task>): Promise<Result<Task, Err>>;
  updateTasks(list: { task: string | Task, updates: Partial<Task> }[]): Promise<Result<Task[], Err>>;

  deleteTask(id: string, recursive?: boolean): Promise<Result<void, Err>>;
  deleteTasks(list: { id: string, recursive?: boolean }[]): Promise<Result<void, Err>>;

  changeOwnership(oldUserID: string, newUserID: string): Promise<Result<Task[], Err>>;
}

export interface ITaskRelationProvider {
  /**
   * Finds all tasks that must be completed before `id`
   */
  getChildrenOf(task: string | Task): Promise<Result<Task[], Err>>;
  /**
   * Gets all tasks that are waiting for `id`
   */
  getParentsOf(task: string | Task): Promise<Result<Task[], Err>>;
  /**
   * Gets all tasks that nothing depends on
   */
  getRootTasks(): Promise<Result<Task[], Err>>;
}

export interface IAdvancedTaskProvider {
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
  exportData(simplify?: boolean): Promise<void>;
  importData(data: string): Promise<number>;
}

// TODO Implement for offline sync
/* interface SyncStatus {
  lastSyncVersion: string; // Last known sync version/timestamp
  pendingOps: Operation[]; // Local ops not yet pushed
}

interface SyncRequest {
  clientId: string;
  lastSyncVersion: string; // e.g., ISO timestamp or logical clock
  changes: Operation[];
}

interface SyncResponse {
  serverVersion: string;
  newChanges: Operation[];
}

interface Operation {
  id: string; // unique op ID
  timestamp: string; // ISO or logical clock
  type: 'add' | 'update' | 'delete';
  payload: Partial<Task>; // etc...
}

interface Query { } */