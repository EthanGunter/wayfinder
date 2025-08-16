import { redirect } from '@sveltejs/kit';
import { authAPIPromise, taskAPIPromise } from '$lib/stores/services';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
	// Resolve all services

	// Get the resolved services
	const auth = await authAPIPromise;

	// Determine active user (prefer active, else default anonymous)
	let activeUser = await auth.getActiveUser();

	if (!activeUser) {
		const anonRes = await auth.getDefaultUser();
		if (anonRes.isOk()) {
			activeUser = anonRes.value;
		} else {
			const users = await auth.listUsers();
			if (users && users.length > 0) {
				activeUser = users[0];
			}
		}
	}

	// If we still don't have an active user, redirect to login
	if (!activeUser) {
		throw redirect(302, '/login');
	}

	return { user: activeUser };
};