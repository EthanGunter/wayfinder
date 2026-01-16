/**
 * Skill Sprint API
 * 
 * Provides reactive stores for skill sprint data and mutation wrappers for sprint operations.
 * 
 * Usage:
 *   import skillSprintsAPI from '$lib/API/SkillSprints';
 * 
 *   // List user's sprints
 *   const sprints = skillSprintsAPI.listUserSprints();
 * 
 *   // Get a specific sprint's state (reactive to all related data)
 *   const sprintState = skillSprintsAPI.getSprintState(sprintId);
 * 
 *   // Create a sprint
 *   const sprint = await skillSprintsAPI.createSprint({ title, goal, startsAt, endsAt });
 * 
 *   // Update plan
 *   const plan = await skillSprintsAPI.setPlan({ sprintId, md });
 */

import ConvexSkillSprintProvider from './ConvexSkillSprintProvider';
import type { ISkillSprintsLocal } from './seam-interfaces';

const skillSprintsAPI: ISkillSprintsLocal = ConvexSkillSprintProvider;

export default skillSprintsAPI;

export type {
	Sprint,
	SprintPlan,
	SprintAdjustment,
	SprintDailyChallenge,
	SprintJournalEntry,
	SprintState,
	CreateSprintParams,
	UpdateSprintParams,
	SetPlanParams,
	AddAdjustmentParams,
	UpsertDailyChallengeParams,
	AddJournalEntryParams,
	GenerateLessonParams,
	GenerateLessonResult
} from './seam-interfaces';
