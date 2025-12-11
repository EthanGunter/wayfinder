import type { InvalidStateError, ArgumentError, NotAuthorizedError, NotFoundError } from "$domain/errors";
import type { AppNode, IAppNode } from "$domain/models/node";
import type { ProjectData, UpdateProjectParams } from "$domain/models/project";
import type { CreateTaskParams, ExportedData, TaskData, Task, UpdateTaskParams } from "$domain/models/task";
import type { Result } from "$domain/result";
import type { FetchableStore, QueryableStore } from "../fetchableStore";

/**
 * Base interface containing methods shared between ITasks and ITasksLocal
 */
export interface ITasksBase {
	/**
	 * Fetches a GraphNode's data by its ID
	 */
	getTask(id: string): QueryableStore<{ id: string }, Task>;
	getTasks(ids: string[]): QueryableStore<{ ids: string[] }, Task[]>;
	getAllUserTasks(userId?: string): QueryableStore<{ userId?: string }, Task[]>;

	updateTask(params: UpdateTaskParams): Promise<Result<{ updated: AppNode, affected: AppNode[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	updateTasks(params: { updates: UpdateTaskParams[] }): Promise<Result<{ updated: AppNode[], affected: AppNode[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;

	deleteTask(params: { id: string }): Promise<Result<{ affected: AppNode[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;
	deleteTasks(params: { ids: string[] }): Promise<Result<{ affected: AppNode[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;

	/**
	 * Finds all GraphNodes that must be completed before `id`
	 */
	getChildrenOf(id: string): QueryableStore<{ id: string }, AppNode[]>;
	/**
	 * Gets all GraphNodes that are waiting for `id`
	 */
	getParentsOf(id: string): QueryableStore<{ id: string }, AppNode[]>;
	/**
	 * Gets all GraphNodes that are children of the same parents as `id`
	 * @note keyed by parent
	 */
	getSiblingsOf(id: string): QueryableStore<{ id: string }, Map<AppNode, AppNode[]>>;

	/**
	 * Gets all GraphNodes that are projects
	 */
	getProjects(): FetchableStore<IAppNode<ProjectData>[]>;
	/**
	 * Gets all GraphNodes that are children of the project with the given ID
	 */
	getProjectSubtree(id: string): FetchableStore<IAppNode<TaskData>[]>;
	/**
	 * Creates a new project
	 */
	createProject(params: {
		title: string;
		content?: string;
		status?: number;
		dueDate?: Date;
		uiPrefs?: {
			showStreak?: boolean;
			showVelocity?: boolean;
			showMomentumScore?: boolean;
			showNextAction?: boolean;
			showMicroWins?: boolean;
		};
	}): Promise<Result<IAppNode<ProjectData>, NotAuthorizedError | InvalidStateError>>;

	/**
	 * Updates a project
	 */
	updateProject(params: UpdateProjectParams): Promise<Result<{ updated: AppNode, affected: AppNode[] }, NotAuthorizedError | NotFoundError | InvalidStateError>>;

	/**
	 * Gets all GraphNodes that are on the "Today's List"
	 */
	getTodaysTasks(): FetchableStore<Task[]>;
	/**
	 * Gets the top N tasks based on priority
	 */
	getPrioritizedTasks(projectId: string, limit: number /* , weights: WeightParams = {
    deadlineWeight: 1, taskDepthWeight: 1, taskCountWeight: 1
} */): Promise<Task[]>;

	searchTasks(searchTerm: string): Promise<Task[]>;

	importData(params: { data: string, mode?: "add" | "replace" | "attemptMerge" }): Promise<Result<number, NotAuthorizedError | ArgumentError | InvalidStateError>>;
	exportData(subtreeId?: string): Promise<ExportedData>;
}

export interface ITasksRemote extends ITasksBase {
	/**
	* Creates a new GraphNode with the given data
	* @returns The new GraphNode's generated ID
	*/
	/* TODO:sync/tasks/refactor An example of divergence between the client-side and remote side APIs. The server should return id updates, 
	the client should frankly return void, since we're using a subscription-based data model */
	createTask(params: { createDetail: CreateTaskParams }): Promise<Result<{ created: Task & { data: TaskData<Date> & { givenId?: string } }, affected: AppNode[] }, NotAuthorizedError | InvalidStateError>>;
	createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<{ created: (Task & { data: TaskData<Date> & { givenId?: string } })[], affected: AppNode[] }, NotAuthorizedError>>;

	// TODO:sync migrate un-synced user data
	// changeOwnership(params: { oldUserID: string, newUserID: string }): Promise<Result<Task[], NotAuthorizedError>>;
}

export interface ITasksLocal extends ITasksBase {
	createTask(params: { createDetail: CreateTaskParams }): Promise<Result<{ oldId: string, newId: string }, InvalidStateError>>;
	createTasks(params: { createDetails: CreateTaskParams[] }): Promise<Result<{ oldId: string, newId: string }[], InvalidStateError | ArgumentError>>;
	handleCreateTasksResponse(response: Result<{ updatedIds: Map<string, string>, affectedTasks: AppNode[] }, { idsToDelete: string[], error: NotAuthorizedError }>): Promise<void>;

	handleUpdateTasksResponse(response: Result<void, { oldState: { updatedId: string, task: Task }[], error: NotAuthorizedError }>): Promise<void>;

	handleDeleteTasksResponse(response: Result<void, { oldState: Task[], error: NotAuthorizedError }>): Promise<void>;

	handleMigrateResponse(response: Result<void, { oldUserID: string, newUserID: string, error: NotAuthorizedError }>): Promise<void>;
}

