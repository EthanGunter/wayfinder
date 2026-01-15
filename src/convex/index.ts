/** Schema definitions for Convex tables and validation */
export {
	UserStatusDef,
	UserFeatureDef,
	UserDef,
	ProjectDataDef,
	TaskDataDef,
	NodeDataDef,
	NodeDef,
} from './schema';

/**
 * BetterAuth integration for Convex. Provides authentication component client,
 * auth factory function, and query to get current authenticated user.
 * Handles session management and user identity resolution.
 */
export * from './auth';

/**
 * Task and project management system. Provides CRUD operations for hierarchical
 * task structures with bidirectional parent-child relationships. Tasks belong
 * to projects (top-level containers) and support multi-parent relationships.
 *
 * Includes mutations for creating, updating, deleting tasks and projects;
 * queries for retrieving tasks by various criteria (today's tasks, prioritized
 * tasks, subtrees, relationships); import/export functionality; and internal
 * utilities for relationship validation and propagation.
 *
 * Projects include calculated metrics (progress, streak, velocity, momentum
 * score, next action, micro wins).
 */
export * from './tasks';

/**
 * Skill sprint system for time-boxed learning periods. Manages sprints with
 * associated plans (versioned markdown), daily challenges (task lists keyed
 * by day), adjustments (change logs), and journal entries.
 *
 * Supports creating sprints, setting/updating plans, adding daily challenges
 * and journal entries, and retrieving complete sprint state.
 */
export * from './skillSprints';

/**
 * User management and profile operations. Provides queries to watch users by
 * authId (single or batch), mutations to update user profiles and delete
 * accounts (with cascade deletion), and internal functions for user creation
 * and lookup during authentication flow.
 *
 * Handles user status (active/deleted) and feature flags.
 */
export * from './users';

/**
 * LLM integration supporting multiple providers (OpenAI, Groq, stub, test).
 * Handles credential resolution from app-level environment variables or
 * user-level settingOverrides.
 *
 * Provides core calling function and action wrapper for making LLM requests
 * with provider and model selection.
 */
export * from './llm';

/**
 * HTTP routes and actions. Provides ping endpoint for health checks and
 * testing, plus default HTTP router with registered BetterAuth routes.
 */
export * from './http';