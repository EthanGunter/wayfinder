import { redirect } from '@sveltejs/kit';
import { authAPIPromise, taskAPIPromise } from '@/API/providerRegistry';
// import { processQueueInClient } from '@/API/SyncQueue';
import type { LayoutLoad } from './$types';
import { Err } from '@/Errors';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
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

	// Queue processing disabled while using direct remote calls
	// try { await processQueueInClient(); } catch (e) { Err.UNHANDLED(e); }

	// If we still don't have an active user, allow auth pages, else redirect to login
	if (activeUser) {
		// Hydrate local data for the active user (idempotent)
		try {
			const tasks = await taskAPIPromise;
			if (tasks?.hydrateForUser) {
				await tasks.hydrateForUser({ user: activeUser });
			}
		} catch (e) { Err.UNHANDLED(e); }
	} else {
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