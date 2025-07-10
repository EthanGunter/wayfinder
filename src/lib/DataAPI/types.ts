// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, ParseError, Err } from "$lib/Errors";
import type { Result, ResultAsync } from "neverthrow";
import type { Task } from "./Task";

export type CreateTaskDTO = Partial<Task> & Omit<Task, "created" | "id" | "completed" | "filepath" | "status" | "children">

// Todo narrow error types once concrete classes are implemented
/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskStorage {
  close(): Promise<void>;

  /* #region Basic CRUD Operations */
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  // TODO-test: sets up relationships if parent(s) or children are populated
  createTask(task: CreateTaskDTO): Promise<Result<string, Err>>; // TODO Implement plural operation
  /**
   * Fetches a task's data by its ID
   */
  readTask(path: string): Promise<Result<Task, NotFoundError | Err>>; // TODO Implement plural operation
  updateTask(id: string, updates: Partial<Task>): Promise<Result<Task, Err>>; // TODO Implement plural operation
  deleteTask(id: string, recursive?: boolean): Promise<Result<void, Err>>; // TODO Implement plural operation
  /* #endregion */

  /* #region Node Relationships */
  /**
   * Finds all tasks that must be completed before `id`
   */
  getChildren(id: string): Promise<Result<Task[], Err>>;
  /**
   * Gets all tasks that are waiting for `id`
   */
  getParents(id: string): Promise<Result<Task[], Err>>;
  /**
   * Gets all tasks that nothing depends on
   */
  getRootTasks(): Promise<Result<Task[], Err>>;
  /* #endregion */

  /* #region Prioritization Logic */
  /**
   * Gets all tasks that are on the "Today's List"
   */
  getTodaysTasks(): Promise<Result<Task[], Err>>;
  /**
   * Adds a task to the "Today's List" at the given position
   */
  setTodaysTask(id: string, position: number): Promise<Result<void, Err>>;
  /**
   * Removes a task from the "Today's List"
   */
  removeTodaysTask(id: string): Promise<Result<void, Err>>;
  /**
   * Gets the top N tasks based on priority
   */
  getPrioritizedTasks(limit: number /* , weights: WeightParams = {
    deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
} */): Promise<Result<Task[], Err>>;

  searchTasks(searchTerm: string): Promise<Task[]>;

  exportData(simplify?: boolean): Promise<string>;
  importData(data: string): Promise<number>;
  /* #endregion */
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