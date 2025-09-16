import { redirect } from '@sveltejs/kit';
import { authAPIPromise, taskAPIPromise } from '@/API/providerRegistry';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
	// Resolve all services

	// Get the resolved services
	const auth = await authAPIPromise;

	// Determine active user (prefer active, else default anonymous)
	let activeUser = await auth.getActiveUser();

	// TODO:Temp anonymous accounts disabled
	/* 	
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
	*/

	// If we still don't have an active user, allow auth pages, else redirect to login
	if (!activeUser) {
		const isAuthPage = url.pathname === '/login' || url.pathname === '/register';
		if (isAuthPage) {
			// Unauthenticated access allowed for auth pages
			return { user: null } as any;
		}
		const redir = encodeURIComponent(url.pathname + url.search);
		throw redirect(302, `/login?redirect=${redir}`);
	}

	return { user: activeUser };
};