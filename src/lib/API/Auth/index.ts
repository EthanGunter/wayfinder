import type { AuthState, IAuthLocal, LocalUser } from '$domain/models/user';
import { Err, NotImplementedError } from '$domain/errors';
import type { Readable } from 'svelte/store';

import browserAuthAPI,
{
	browserAuthState,
	browserCachedUsers,
} from './BrowserAuthProvider';
import { writable } from 'svelte/store';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
// import ConvexAuthProvider from "../../convex/auth";
import type { IAuth } from '$domain/models/user';

// Canonical source for whether remote auth operations are available.
// null => remote unavailable; non-null => remote enabled and usable.
export const remoteAuth = writable<IAuth | null>(null);

(async () => {
	try {
		remoteAuth.set(SupabaseAuthProvider);
	} catch (e) {
		console.error('Failed to initialize remoteAuth provider:', e);
		remoteAuth.set(null);
	}
})();

let authAPI: IAuthLocal,
	authState: Readable<AuthState>,
	cachedUsers: Readable<LocalUser[]>

if (true /* browser */) {
	authAPI = browserAuthAPI;
	authState = browserAuthState;
	cachedUsers = browserCachedUsers;
} else /* if ( mobile ) */ {
	Err.throw(new NotImplementedError("Mobile auth provider not implemented"));
}


export {
	authAPI,
	authState,
	cachedUsers,
}

