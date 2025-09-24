import { redirect } from '@sveltejs/kit';
import { tasksAPI } from '@/API/Tasks';
import { authState } from '@/API/Auth';
import { get } from 'svelte/store';
// import { processQueueInClient } from '@/API/SyncQueue';
import type { LayoutLoad } from './$types';
import { Err } from '@/Errors';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {

	// Get current auth state from store
	const currentAuthState = get(authState);

	// Wait for auth to finish loading if still in loading state
	if (currentAuthState.status === 'loading') {
		// Wait for auth to initialize to either signed-in or signed-out
		await new Promise(resolve => {
			const unsubscribe = authState.subscribe(state => {
				if (state.status !== 'loading') {
					unsubscribe();
					resolve(undefined);
				}
			});
		});
	}

	const finalAuthState = get(authState);

	// Queue processing disabled while using direct remote calls
	// try { await processQueueInClient(); } catch (e) { Err.UNHANDLED(e); }

	// Route based on auth status
    if (finalAuthState.status === "signed-in") {
		// User is authenticated - hydrate their data and allow access to app
		try {
            await tasksAPI.hydrateForUser({ user: finalAuthState.user });
		} catch (e) { Err.UNHANDLED(e); }
	} else if (finalAuthState.status === "signed-out") {
		// User is not authenticated
		const isAuthPage = url.pathname === '/login' || url.pathname === '/register';
		if (!isAuthPage) {
			// Don't redirect to the same page to avoid infinite loops
			const redir = encodeURIComponent(url.pathname + url.search);
			throw redirect(302, `/login?redirect=${redir}`);
		}
	} else {
		// Auth in error state - treat as signed out
		const isAuthPage = url.pathname === '/login' || url.pathname === '/register';
		if (isAuthPage) {
			return {};
		}
		throw redirect(302, '/login');
	}
};