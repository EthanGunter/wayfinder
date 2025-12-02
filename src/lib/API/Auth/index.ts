import type { UserFeature } from '$domain/models/user';
import { Err, NotImplementedError } from '$domain/errors';
import type { Readable } from 'svelte/store';
import { derived } from 'svelte/store';

import ConvexAuthProvider from './ConvexAuthProvider';
import type { AuthState, IAuthLocal } from './seam-interfaces';
import PassthroughAuthProvider, { passthroughAuthState } from './PassthroughAuthProvider';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
// TODO:?? To be fair, it doesn't really may sense for auth to *not* be available...
export const remoteAuth = ConvexAuthProvider;

let authAPI: IAuthLocal,
	authState: Readable<AuthState>

// eslint-disable-next-line no-constant-condition
if (true /* browser */) {
	authAPI = PassthroughAuthProvider;
	authState = passthroughAuthState;
} else /* if ( mobile ) */ {
	Err.throw(new NotImplementedError("Mobile auth provider not implemented"));
}

const userFeatures: Readable<UserFeature[]> = derived(
	authState,
	($authState) => $authState.status === 'signed-in' ? $authState.user.features : []
);

/**
 * Returns a reactive store that tracks whether the user has a specific feature.
 * 
 * **This is the standard pattern for feature checks** - use it everywhere for consistency:
 * 
 * ```ts
 * import { hasFeature } from '$lib/API/Auth';
 * 
 * // Single feature
 * const hasDev = hasFeature('dev');
 * 
 * // Multiple features
 * const hasSync = hasFeature('task-sync');
 * 
 * // In templates
 * {#if $hasDev}
 *   <DevTools />
 * {/if}
 * 
 * // In $derived expressions
 * const showAdvanced = $derived($hasDev && $hasSync);
 * ```
 * 
 * Type-safe and reactive - updates instantly when user features change.
 */
export function hasFeature(feature: UserFeature): Readable<boolean> {
	return derived(userFeatures, ($features) => $features.includes(feature));
}

export {
	authAPI,
	authState,
}

