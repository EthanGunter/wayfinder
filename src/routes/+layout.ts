import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import SupabaseAuthProvider from '$lib/API/Auth/SupabaseAuthProvider';
import { isAnonymous, type LocalUser } from '$lib/API/Auth/User';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import SupabaseTaskProvider from '$lib/API/Tasks/SupabaseTaskProvider';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
	// Initialize remote providers (always available)
	const remoteAuth = await SupabaseAuthProvider.get();
	const remoteTaskProvider = await SupabaseTaskProvider.get();

	// Wrap with browser providers (local-first, sync to remote when available)
	const tasks = await BrowserTaskProvider.get(remoteTaskProvider);
	const auth = await BrowserAuthProvider.get(remoteAuth, tasks);

	// Determine active user (prefer active, else default anonymous, else first existing)
	let activeUser = await auth.getActiveUser();
	if (!activeUser) {
		const anonRes = await auth.getDefaultUser();
		if (anonRes.isOk()) {
			activeUser = anonRes.value;
		} else {
			const users = await auth.listUsers();
			if (users && users.length > 0) {
				activeUser = users[0] as LocalUser;
			}
		}
	}

	let user: LocalUser;

	if (activeUser && isAnonymous(activeUser)) {
		// Anonymous user - local only
		user = activeUser;
	} else if (activeUser) {
		// Non-anonymous - try to merge with remote if present
		const remoteRes = await remoteAuth.getUser({ id: activeUser.id });
		if (remoteRes.isErr()) {
			user = activeUser;
		} else {
			const remoteUser = remoteRes.value;
			user = {
				...activeUser,
				...remoteUser,
				created_at: activeUser.created_at
			};
		}
	} else {
		// As a final fallback, ensure we always expose an anonymous-like user
		const anonRes = await auth.getDefaultUser();
		user = anonRes.isOk() ? anonRes.value : ({ id: 'anonymous', display_name: 'anonymous', created_at: new Date().toISOString(), status: 'active', features: [] } as LocalUser);
	}

	return { auth, user, tasks };
};