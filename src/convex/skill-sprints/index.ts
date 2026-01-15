//#region Mutations

/** Create a new skill sprint with title, goal, and time bounds. Skill sprints are time-boxed learning periods with associated plans, daily challenges, and journal entries. */
export { createSprint } from './skillSprints';

/** Set or update the plan for a skill sprint. Plans are versioned markdown documents. Creates new plan if none exists, otherwise increments version and updates markdown. Returns the plan document. */
export { setPlan } from './skillSprints';

/** Add an adjustment entry to a skill sprint. Adjustments are timestamped markdown notes documenting changes or reflections during the sprint. Returns the created adjustment. */
export { addAdjustment } from './skillSprints';

/** Create or update a daily challenge for a specific day of a sprint. Daily challenges contain a list of items (with optional completion timestamps) and are keyed by sprint ID and day key (e.g., "2026-01-12"). Tracks which plan version was used to generate the challenge. Returns the challenge document. */
export { upsertDailyChallenge } from './skillSprints';

/** Add a journal entry to a skill sprint. Journal entries are timestamped markdown notes, optionally associated with a specific day key. Returns the created journal entry. */
export { addJournalEntry } from './skillSprints';

//#endregion

//#region Queries

/** Get a single skill sprint by ID. Verifies ownership before returning. */
export { getSprint } from './skillSprints';

/** Get complete state of a skill sprint including the sprint itself, current plan, all adjustments, all daily challenges, and all journal entries. Returns aggregated sprint state object. */
export { getSprintState } from './skillSprints';

//#endregion
