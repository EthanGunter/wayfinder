import type { InvalidStateError, ArgumentError, NotAuthorizedError } from "$domain/errors";
import type { CreateTaskParams, Task, UpdateTaskParams } from "$domain/models/task";
import type { Result } from "$domain/result";
import type { FetchableStore, QueryableStore } from "../fetchableStore";

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
	getTask(params: { id: string }): QueryableStore<{ id: string }, Task>;
	getTasks(params: { ids: string[] }): QueryableStore<{ ids: string[] }, Task[]>;
	getAllUserTasks(params: { userId?: string }): QueryableStore<{ userId?: string }, Task[]>;
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
	getChildrenOf(params: { id: string }): QueryableStore<{ id: string }, Task[]>;
	/**
	 * Gets all tasks that are waiting for `id`
	 */
	getParentsOf(params: { id: string }): QueryableStore<{ id: string }, Task[]>;
	/**
	 * Gets all tasks that are children of the same parents as `id`
	 * @note keyed by parent
	 */
	getSiblingsOf(params: { id: string }): QueryableStore<{ id: string }, Map<Task, Task[]>>;
	/**
	 * Gets all tasks that nothing depends on
	 */
	getRootTasks(): FetchableStore<Task[]>;

	/**
	 * Gets all tasks that are on the "Today's List"
	 */
	getTodaysTasks(): FetchableStore<Task[]>;
	/**
	 * Gets the top N tasks based on priority
	 */
	getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): QueryableStore<{ limit: number }, Task[]>;

	searchTasks(searchTerm: string): Promise<Task[]>;
};


export interface ITasksLocal {
	createTask(params: { createDetail: CreateTaskParams }): Promise<Result<string, InvalidStateError>>;
	createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<string[], InvalidStateError | ArgumentError>>;
	handleCreateTasksResponse(response: Result<{ updatedIds: Map<string, string>, affectedTasks: Task[] }, { idsToDelete: string[], error: NotAuthorizedError }>): Promise<void>;

	/**
	 * Fetches a task's data by its ID
	 */
	getTask(params: { id: string }): QueryableStore<{ id: string }, Task>;
	getTasks(params: { ids: string[] }): QueryableStore<{ ids: string[] }, Task[]>;
	getAllUserTasks(params: { userId?: string }): QueryableStore<{ userId?: string }, Task[]>;

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
	getChildrenOf(params: { id: string }): QueryableStore<{ id: string }, Task[]>;
	/**
	 * Gets all tasks that are waiting for `id`
	 */
	getParentsOf(params: { id: string }): QueryableStore<{ id: string }, Task[]>;
	/**
	 * Gets all tasks that are children of the same parents as `id`
	 * @note keyed by parent
	 */
	getSiblingsOf(params: { id: string }): QueryableStore<{ id: string }, Map<Task, Task[]>>;

	/**
	 * Gets all tasks that nothing depends on
	 */
	getRootTasks(): FetchableStore<Task[]>;

	/**
	 * Gets all tasks that are on the "Today's List"
	 */
	getTodaysTasks(): FetchableStore<Task[]>;
	/**
	 * Gets the top N tasks based on priority
	 */
	getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): QueryableStore<{ limit: number }, Task[]>;

	searchTasks(searchTerm: string): Promise<Task[]>;

	/**
	 * @param userId Used to subscribe to ALL tasks for a user
	 * @param ids For tracking only specific tasks
	 * @param depth the recursive depth of ancestor/descendants to include in the subscription
	 * @param onInitialize Called immediately on subscription. Provides the initial state of data
	 * @param onChange Called everytime a task is modified. 
	 * @return unsubscribe function
   */
	/* 	subscribeTasks(
			params:
				| {
					userId: string;
					ids?: never;
					// onInitialize: (tasks: Task[]) => void;
					// onChange: (changes: TaskDelta[]) => void;
				}
				| {
					ids: string[];
					ancestorDepth: number;
					descendantDepth: number;
					userId?: never;
					// onInitialize: (tasks: Task[]) => void;
					// onChange: (changes: TaskDelta[]) => void;
				}
		): { unsubscribe: () => void, tasks: Readable<Task[]> }; */

	exportData(): Promise<string>;
	importData(params: { data: string, mode?: "add" | "replace" | "attemptMerge" }): Promise<number>;

	// hydrateForUser(params: { user: User }): Promise<void>;
};

