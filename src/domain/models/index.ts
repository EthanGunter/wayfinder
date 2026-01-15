/** Node types and interfaces for hierarchical data structures */
export type { AppData, AppNode, IAppNode } from './node';

/** Project data models and status enums */
export type { ProjectData, UpdateProjectParams } from './project';
export { ProjectStatus, isProjectActive } from './project';

/** Task data models, status enums, relationship operations, and export formats */
export type {
	Task,
	TaskData,
	CreateTaskParams,
	CreateNodeParams,
	UpdateTaskParams,
	PopulatedTaskDTO,
	RelationshipOperation,
} from './task';
export { TaskStatus, isTaskCompleted, calculateRelationshipUpdates, applyRelationshipOperations, EXPORT_VERSIONS, type ExportedData } from './task';

/** User models, authentication types, and account management */
export type {
	User,
	UserStatus,
	UserFeature,
	SessionUser,
	LoginCredentials,
	SignOutOptions,
	RegistrationRequirements,
	AccountIssueTarget,
	UserServerErr,
	UpdateErr,
	DeleteErr,
	EnsureUserErr,
	WatchUserErr,
} from './user';
export { isAnonymous, getDefaultUserFeatures, IncorrectPasswordError } from './user';
