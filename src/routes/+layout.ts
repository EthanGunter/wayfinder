import { goto } from '$app/navigation';
import BrowserAuthProvider from '$lib/API/Auth/BrowserAuthProvider';
import { isAnonymous, type LocalUser } from '$lib/API/Auth/User';
import BrowserTaskProvider from '$lib/API/Tasks/BrowserTaskProvider';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
	// Wrap with browser providers (local-first, sync to remote when available)
	const tasks = await BrowserTaskProvider.get(/* remoteTaskProvider */);
	const auth = await BrowserAuthProvider.get(/* remoteAuth, tasks */);

	// Determine active user (prefer active, else default anonymous)
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

	// If we still don't have an active user, redirect to login
	if (!activeUser) {
		throw redirect(302, '/login');
	}

	return { user: activeUser, auth, tasks };
};