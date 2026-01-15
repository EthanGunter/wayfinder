//#region Queries

/** Get current user's authentication identity (authId and email) from session. Returns null if not authenticated. */
export { whoami } from './users';

/** Watch a single user by authId. Returns user document normalized to User model, or null if not found. Throws if user is scheduled for deletion. */
export { watchUser } from './users';

/** Watch multiple users by their authIds. Returns array of user documents, silently filtering out deleted users to avoid breaking batch operations. */
export { watchUsers } from './users';

//#endregion

//#region Mutations

/** Update current user's profile information. Supports updating display name, avatar URL, status, features, and setting overrides. Verifies user owns the account being updated. Returns updated user document. */
export { updateUser } from './users';

/** Delete the current user's account and all associated data. Revokes all BetterAuth sessions, cascades deletion of all user's nodes (tasks/projects), and removes user document. Returns deletion counts. */
export { deleteSelf } from './users';

//#endregion

//#region Internal

/** Internal query to get user by authId. Used by other backend functions, not exposed to frontend. */
export { getUserByAuthId } from './users';

/** Internal mutation to create a user document. Used during authentication flow. */
export { createUser } from './users';

/** Action to ensure current user exists in database. Checks if user exists, creates if missing. Used during authentication to bootstrap user records. Returns user's authId. */
export { ensureCurrentUser } from './users';

//#endregion
