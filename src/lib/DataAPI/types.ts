// TODO: In the future, add CRDT/merge-aware methods for concurrent edits

import type { NotFoundError, ParseError, Err } from "$lib/Errors/Errors";
import type { Result, ResultAsync } from "neverthrow";

// Todo narrow error types once concrete classes are implemented
/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface IStorage {
  // Node operations
  /**
   * Creates a new node with the given data
   */
  createNode(node: Omit<TaskData, "created">): Promise<Result<void, Err>>;
  /**
   * Fetches a node's data by its ID
   */
  readNode(id: string): Promise<Result<TaskData, NotFoundError | Err>>;
  updateNode(id: string, updates: Partial<TaskData>): Promise<Result<TaskData, Err>>;
  deleteNode(id: string, recursive: boolean): Promise<Result<void, Err>>;
}


export interface TaskData {
  id: string,
  filepath: string
  title: string,
  created: string, // ISO Timestamp
  content?: string,
  lastEdit?: string, // ISO Timestamp
  /** This task's prequisite[s] */
  dependsOn?: string, // Todo this might become an array in the future
  /** Tasks that can't be completed until this one is */
  dependants?: string[]
}


interface SyncStatus {
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

interface Query { }