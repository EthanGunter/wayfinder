import { api as convexApi } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';
import { sharedConvexClient as client } from '$lib/API/ConvexClient';
import { createFetchableReadable as createFetchable, createQueryable } from '$lib/API/fetchableStore';
import { Err } from '$domain/errors';
import type {
	ISkillSprintsRemote,
	ISkillSprintsLocal,
	CreateSprintParams,
	SetPlanParams,
	AddAdjustmentParams,
	UpsertDailyChallengeParams,
	AddJournalEntryParams,
	Sprint,
	SprintPlan,
	SprintAdjustment,
	SprintDailyChallenge,
	SprintJournalEntry,
	SprintState
} from './seam-interfaces';

export const api: ISkillSprintsRemote = {
	// Queries
	listUserSprints: () =>
		createFetchable((set) => {
			const unsubscribe = client.onUpdate(
				convexApi.skillSprints.listUserSprints,
				{},
				(result) => {
					set({ status: 'resolved', value: result });
				},
				(error: Error) => {
					set({ status: 'error', error: Err.wrap(error) });
				}
			);
			return () => {
				unsubscribe();
			};
		}),

	getSprintState: (sprintId) =>
		createQueryable<{ sprintId: Id<'skillSprints'> }, SprintState>(
			{ sprintId },
			(params, set) => {
				const unsubscribe = client.onUpdate(
					convexApi.skillSprints.getSprintState,
					{ sprintId: params.sprintId },
					(result) => {
						set({ status: 'resolved', value: result });
					},
					(error: Error) => {
						set({ status: 'error', error: Err.wrap(error) });
					}
				);
				return () => {
					unsubscribe();
				};
			}
		),

	// Mutations
	createSprint: async (params: CreateSprintParams): Promise<Sprint> => {
		return await client.mutation(convexApi.skillSprints.createSprint, params);
	},

	updateSprint: async (params) => {
		return await client.mutation(convexApi.skillSprints.updateSprint, params);
	},

	setPlan: async (params: SetPlanParams): Promise<SprintPlan> => {
		return await client.mutation(convexApi.skillSprints.setPlan, params);
	},

	addAdjustment: async (params: AddAdjustmentParams): Promise<SprintAdjustment> => {
		return await client.mutation(convexApi.skillSprints.addAdjustment, params);
	},

	upsertDailyChallenge: async (
		params: UpsertDailyChallengeParams
	): Promise<SprintDailyChallenge> => {
		return await client.mutation(convexApi.skillSprints.upsertDailyChallenge, params);
	},

	addJournalEntry: async (params: AddJournalEntryParams): Promise<SprintJournalEntry> => {
		return await client.mutation(convexApi.skillSprints.addJournalEntry, params);
	}
};

const localApi: ISkillSprintsLocal = {
	listUserSprints: () => api.listUserSprints(),
	getSprintState: (sprintId: Id<'skillSprints'>) => api.getSprintState(sprintId),
	createSprint: async (params) => api.createSprint(params),
	updateSprint: async (params) => api.updateSprint(params),
	setPlan: async (params) => api.setPlan(params),
	addAdjustment: async (params) => api.addAdjustment(params),
	upsertDailyChallenge: async (params) => api.upsertDailyChallenge(params),
	addJournalEntry: async (params) => api.addJournalEntry(params)
};

export default localApi;
