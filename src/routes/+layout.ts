import { redirect } from '@sveltejs/kit';
import { tasksAPI } from '$lib/API/Tasks';
import { authState } from '$lib/API/Auth';
import { get } from 'svelte/store';
// import { processQueueInClient } from '$lib/API/SyncQueue';
import type { LayoutLoad } from './$types';
import { Err } from '$domain/errors';

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
		await tasksAPI.hydrateForUser({ user: finalAuthState.user });
	} else if (finalAuthState.status === "signed-out") {
		// User is not authenticated
		const isAuthPage = url.pathname === '/login' || url.pathname === '/register';
		if (!isAuthPage) {
			// Don't redirect to the same page to avoid infinite loops
			const redir = encodeURIComponent(url.pathname + url.search);
			throw redirect(302, `/login?redirect=${redir}`);
		}
	} else if (finalAuthState.status === 'error') {
		// TODO:UX Add error page
		console.error(finalAuthState.error);
		throw redirect(302, `/login`);
	}
};