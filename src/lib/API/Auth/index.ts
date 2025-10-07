import type { AuthState, IAuthLocal } from './types';
import type { LocalUser } from './User';
import type { Readable } from 'svelte/store';
import { Err, NotImplementedError } from '$domain/errors';

import browserAuthAPI, 
{
	browserAuthState,
	browserCachedUsers,
} from './BrowserAuthProvider';

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

