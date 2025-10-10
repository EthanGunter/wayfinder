import type { LocalUser } from '$domain/models/user';
import { Err, NotImplementedError } from '$domain/errors';
import type { Readable } from 'svelte/store';

import browserAuthAPI,
{
	browserAuthState,
	browserCachedUsers,
} from './BrowserAuthProvider';
import { derived, get, writable } from 'svelte/store';

import ConvexAuthProvider from './ConvexAuthProvider';
import type { AuthState, IAuthLocal, IAuthRemote } from './seam-interfaces';
import { getApi } from './PassthroughAuthProvider';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
export const remoteAuth = writable<IAuthRemote | null>(null);

(async () => {
	try {
		remoteAuth.set(ConvexAuthProvider);
	} catch (e) {
		console.error('Failed to initialize remoteAuth provider:', e);
		remoteAuth.set(null);
	}
})();

let authAPI: IAuthLocal,
	authState: Readable<AuthState>,
	cachedUsers: Readable<LocalUser[]>

if (true /* browser */) {
	authAPI = getApi(browserAuthAPI, get(remoteAuth) as IAuthRemote);
	authState = derived(authAPI.watchAuthState(), (state) => state);
	console.log('[TODO:debug EG] index.ts: authState set to browserAuthState'); // TODO:debug EG
	cachedUsers = browserCachedUsers;
} else /* if ( mobile ) */ {
	Err.throw(new NotImplementedError("Mobile auth provider not implemented"));
}


export {
	authAPI,
	authState,
	cachedUsers,
}

