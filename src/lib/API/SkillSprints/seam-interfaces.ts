import type { Doc, Id } from '$convex/_generated/dataModel';
import type { FetchableStore, QueryableStore } from '../fetchableStore';

export type Sprint = Doc<'skillSprints'>;
export type SprintPlan = Doc<'skillSprintPlans'>;
export type SprintAdjustment = Doc<'skillSprintAdjustments'>;
export type SprintDailyChallenge = Doc<'skillSprintLessons'>;
export type SprintJournalEntry = Doc<'skillSprintJournalEntries'>;

export interface SprintState {
	sprint: Sprint;
	plan?: SprintPlan;
	adjustments: SprintAdjustment[];
	dailyChallenges: SprintDailyChallenge[];
	journalEntries: SprintJournalEntry[];
}

export interface CreateSprintParams {
	title: string;
	goal: string;
	startsAt: number;
	endsAt: number;
}

export interface UpdateSprintParams {
	sprintId: Id<'skillSprints'>;
	title?: string;
	goal?: string;
	startsAt?: number;
	endsAt?: number;
	archivedAt?: number;
}

export interface SetPlanParams {
	sprintId: Id<'skillSprints'>;
	md: string;
}

export interface AddAdjustmentParams {
	sprintId: Id<'skillSprints'>;
	md: string;
}

export interface UpsertDailyChallengeParams {
	sprintId: Id<'skillSprints'>;
	dateCreated: number;
	status?: 'pending' | 'complete' | 'replaced';
	planVersion: number;
	items: Array<{
		id: string;
		title: string;
		detailsMd?: string;
		completedAt?: number;
	}>;
}

export interface AddJournalEntryParams {
	sprintId: Id<'skillSprints'>;
	md: string;
	dateCreated?: number;
}

/**
 * Remote API for Skill Sprints (backend operations)
 */
export interface ISkillSprintsRemote {
	// Queries
	listUserSprints: () => FetchableStore<Sprint[]>;
	getSprintState: (sprintId: Id<'skillSprints'>) => QueryableStore<{ sprintId: Id<'skillSprints'> }, SprintState>;

	// Mutations
	createSprint: (params: CreateSprintParams) => Promise<Sprint>;
	updateSprint: (params: UpdateSprintParams) => Promise<Sprint>;
	setPlan: (params: SetPlanParams) => Promise<SprintPlan>;
	addAdjustment: (params: AddAdjustmentParams) => Promise<SprintAdjustment>;
	upsertDailyChallenge: (params: UpsertDailyChallengeParams) => Promise<SprintDailyChallenge>;
	addJournalEntry: (params: AddJournalEntryParams) => Promise<SprintJournalEntry>;
}

/**
 * Local API for Skill Sprints (exposed to app components)
 */
export interface ISkillSprintsLocal extends ISkillSprintsRemote {}
