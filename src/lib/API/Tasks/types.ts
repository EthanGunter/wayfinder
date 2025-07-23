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


// TODO narrow error types once concrete classes are implemented
export type ITaskAPI = ITaskCrudAPI & ITaskRelationAPI & IAdvancedTaskAPI
export type ITaskReverter = ITaskCrudAPIReverter

// TODO Should plural functions return an array of errors?
/**
 * Manages modifications to markdown files that represent tasks,
 * as well as keeping a database index in sync for rapid querying of data
 */
export interface ITaskCrudAPI {
  /**
   * Creates a new task with the given data
   * @returns The new task's generated ID
   */
  // TODO-test: sets up relationships if parent(s) or children are populated
  createTask(task: CreateTaskDTO): Promise<Result<Task>>;
  createTasks(tasks: CreateTaskDTO[]): Promise<BatchResult<Task>>;
  /**
   * Fetches a task's data by its ID
   */
  getTask(id: string): Promise<Result<Task, NotFoundError>>;
  getTasks(ids: string[]): Promise<BatchResult<Task, NotFoundError>>;
  getAllUserTasks(userId: string): Promise<BatchResult<Task, NotFoundError>>;
  /**
   * @param task can be passed as an id
   */
  updateTask(task: string | Task, changes: Partial<Task>): Promise<Result<Task>>;
  updateTasks(list: { task: string | Task, changes: Partial<Task> }[]): Promise<BatchResult<Task>>;

  deleteTask(id: string, recursive?: boolean): Promise<Result<void>>;
  deleteTasks(list: { id: string, recursive?: boolean }[]): Promise<Result<void>>;

  changeOwnership(oldUserID: string, newUserID: string): Promise<BatchResult<Task>>;
}
export interface ITaskCrudAPIReverter {
  undoCreateTask(createdId: string): Promise<void>;
  undoCreateTasks(createdIds: string[]): Promise<void>;
  undoUpdateTask(task: string | Task, changes: Partial<Task>): Promise<void>;
  undoUpdateTasks(list: { task: string | Task, changes: Partial<Task> }[]): Promise<void>;
  undoDeleteTask(id: string, recursive?: boolean): Promise<void>;
  undoDeleteTasks(list: { id: string, recursive?: boolean }[]): Promise<void>;
  undoChangeOwnership(oldUserID: string, newUserID: string): Promise<void>;
}

export interface ITaskRelationAPI {
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

export interface IAdvancedTaskAPI {
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

