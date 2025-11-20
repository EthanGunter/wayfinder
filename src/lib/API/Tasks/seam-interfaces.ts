import type { InvalidStateError, ArgumentError, NotAuthorizedError, NotFoundError } from "$domain/errors";
import type { CreateTaskParams, ExportedData, TaskData, UpdateTaskParams } from "$domain/models/task";
import type { Result } from "$domain/result";
import type { FetchableStore, QueryableStore } from "../fetchableStore";

export interface ITasks {
	/**
	* Creates a new task with the given data
	* @returns The new task's generated ID
	*/
	/* TODO:sync/tasks/refactor An example of divergence between the client-side and remote side APIs. The server should return id updates, 
	the client should frankly return void, since we're using a subscription-based data model */
	createTask(params: { createDetail: CreateTaskParams }): Promise<Result<{ created: TaskData & { givenId?: string }, affected: TaskData[] }, NotAuthorizedError | InvalidStateError>>;
	createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<{ created: (TaskData & { givenId?: string })[], affected: TaskData[] }, NotAuthorizedError>>;
	/**
	 * Fetches a task's data by its ID
	 */
	getTask(id: string): QueryableStore<{ id: string }, TaskData>;
	getTasks(ids: string[]): QueryableStore<{ ids: string[] }, TaskData[]>;
	getAllUserTasks(userId?: string): QueryableStore<{ userId?: string }, TaskData[]>;
	/**
	 * @param task can be passed as an id
	 */
	updateTask(params: UpdateTaskParams): Promise<Result<{ updated: TaskData, affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	updateTasks(params: { updates: UpdateTaskParams[] }): Promise<Result<{ updated: TaskData[], affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;

	deleteTask(params: { id: string }): Promise<Result<{ affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	deleteTasks(params: { ids: string[] }): Promise<Result<{ affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;

	// TODO:sync migrate un-synced user data
	// changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<Result<Task[], NotAuthorizedError>>;

	/**
	 * Finds all tasks that must be completed before `id`
	 */
	getChildrenOf(id: string): QueryableStore<{ id: string }, TaskData[]>;
	/**
	 * Gets all tasks that are waiting for `id`
	 */
	getParentsOf(id: string): QueryableStore<{ id: string }, TaskData[]>;
	/**
	 * Gets all tasks that are children of the same parents as `id`
	 * @note keyed by parent
	 */
	getSiblingsOf(id: string): QueryableStore<{ id: string }, Map<TaskData, TaskData[]>>;
	/**
	 * Gets all tasks that nothing depends on
	 */
	getRootTasks(): FetchableStore<TaskData[]>;

	/**
	 * Gets all tasks that are on the "Today's List"
	 */
	getTodaysTasks(): FetchableStore<TaskData[]>;
	/**
	 * Gets the top N tasks based on priority
	 */
	getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): QueryableStore<{ limit: number }, TaskData[]>;

	searchTasks(searchTerm: string): Promise<TaskData[]>;

	importData(params: { data: string, mode?: "add" | "replace" | "attemptMerge" }): Promise<Result<number, NotAuthorizedError | ArgumentError | InvalidStateError>>;
	exportData(subtreeId?: string): Promise<ExportedData>;
};


export interface ITasksLocal {
	createTask(params: { createDetail: CreateTaskParams }): Promise<Result<string, InvalidStateError>>;
	createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<string[], InvalidStateError | ArgumentError>>;
	handleCreateTasksResponse(response: Result<{ updatedIds: Map<string, string>, affectedTasks: TaskData[] }, { idsToDelete: string[], error: NotAuthorizedError }>): Promise<void>;

	/**
	 * Fetches a task's data by its ID
	 */
	getTask(id: string): QueryableStore<{ id: string }, TaskData>;
	getTasks(ids: string[]): QueryableStore<{ ids: string[] }, TaskData[]>;
	getAllUserTasks(userId?: string): QueryableStore<{ userId?: string }, TaskData[]>;

	/**
	 * @param task can be passed as an id
	 */
	updateTask(params: UpdateTaskParams): Promise<Result<{ updated: TaskData, affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	updateTasks(params: { updates: UpdateTaskParams[] }): Promise<Result<{ updated: TaskData[], affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	handleUpdateTasksResponse(response: Result<void, { oldState: { updatedId: string, task: TaskData }[], error: NotAuthorizedError }>): Promise<void>;

	deleteTask(params: { id: string }): Promise<Result<{ affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	deleteTasks(params: { ids: string[] }): Promise<Result<{ affected: TaskData[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	handleDeleteTasksResponse(response: Result<void, { oldState: TaskData[], error: NotAuthorizedError }>): Promise<void>;

	handleMigrateResponse(response: Result<void, { oldUserID: string, newUserID: string, error: NotAuthorizedError }>): Promise<void>;

	/**
	 * Finds all tasks that must be completed before `id`
	 */
	getChildrenOf(id: string): QueryableStore<{ id: string }, TaskData[]>;
	/**
	 * Gets all tasks that are waiting for `id`
	 */
	getParentsOf(id: string): QueryableStore<{ id: string }, TaskData[]>;
	/**
	 * Gets all tasks that are children of the same parents as `id`
	 * @note keyed by parent
	 */
	getSiblingsOf(id: string): QueryableStore<{ id: string }, Map<TaskData, TaskData[]>>;

	/**
	 * Gets all tasks that nothing depends on
	 */
	getRootTasks(): FetchableStore<TaskData[]>;

	/**
	 * Gets all tasks that are on the "Today's List"
	 */
	getTodaysTasks(): FetchableStore<TaskData[]>;
	/**
	 * Gets the top N tasks based on priority
	 */
	getPrioritizedTasks(limit: number /* , weights: WeightParams = {
      deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
  } */): QueryableStore<{ limit: number }, TaskData[]>;

	searchTasks(searchTerm: string): Promise<TaskData[]>;

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

	exportData(subtreeId?: string): Promise<ExportedData>;
	importData(params: { data: string, mode?: "add" | "replace" | "attemptMerge" }): Promise<Result<number, NotAuthorizedError | ArgumentError | InvalidStateError>>;

	// hydrateForUser(params: { user: User }): Promise<void>;
};

