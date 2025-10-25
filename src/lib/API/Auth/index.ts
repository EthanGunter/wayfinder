import type { SessionUser } from '$domain/models/user';
import { Err, NotImplementedError } from '$domain/errors';
import type { Readable } from 'svelte/store';

import ConvexAuthProvider from './ConvexAuthProvider';
import type { AuthState, IAuthLocal, IAuthRemote } from './seam-interfaces';
import PassthroughAuthProvider, { passthroughAuthState, passthroughCachedUsers } from './PassthroughAuthProvider';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
// TODO:?? To be fair, it doesn't really may sense for auth to *not* be available...
export const remoteAuth = ConvexAuthProvider;

let authAPI: IAuthLocal,
	authState: Readable<AuthState>,
	cachedUsers: Readable<SessionUser[]>

if (true /* browser */) {
	authAPI = PassthroughAuthProvider;
	cachedUsers = passthroughCachedUsers;
	authState = passthroughAuthState;
	console.log('[TODO:debug EG] index.ts: authState assigned to passthroughAuthState'); // TODO:debug EG
	authState.subscribe((state) => {
		console.log('[TODO:debug EG] index.ts: authState changed to', state.status); // TODO:debug EG
	});
} else /* if ( mobile ) */ {
	Err.throw(new NotImplementedError("Mobile auth provider not implemented"));
}


export {
	authAPI,
	authState,
	cachedUsers,
}

