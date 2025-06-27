// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, ParseError, Err } from "$lib/Errors";
import type { Result, ResultAsync } from "neverthrow";
import type { TaskData } from "./Task";

export type CreateTaskDTO = Omit<TaskData, "created" | "id">

// Todo narrow error types once concrete classes are implemented
/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskStorage {
  // Task Node operations
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  createTask(task: CreateTaskDTO): Promise<Result<string, Err>>;
  /**
   * Fetches a task's data by its ID
   */
  readTask(path: string): Promise<Result<TaskData, NotFoundError | Err>>;
  updateTask(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, Err>>;
  deleteTask(id: string, recursive?: boolean): Promise<Result<void, Err>>;
  close(): Promise<void>;
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
  payload: Partial<TaskData>; // etc...
}

interface Query { } */