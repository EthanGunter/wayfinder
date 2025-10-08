import { redirect } from '@sveltejs/kit';
import { tasksAPI } from '$lib/API/Tasks';
import { authAPI } from '$lib/API/Auth';
import { get } from 'svelte/store';
// import { processQueueInClient } from '$lib/API/SyncQueue';
import type { LayoutLoad } from './$types';
import { Err } from '$domain/errors';
import { authkit } from '$lib/API/WorkOSAuthKit';
import type { AuthState } from '$lib/API/Auth/seam-interfaces';

export const ssr = false;
export const prerender = true;

export const load: LayoutLoad = async ({ parent, url }) => {
	// Wait for auth to initialize to either signed-in or signed-out
	const finalAuthState = await new Promise<AuthState>(resolve => {
		const unsubscribe = authAPI.watchAuthState().subscribe(state => {
			if (state.status !== 'loading') {
				console.log("auth loaded");

				unsubscribe();
				resolve(state);
			}
		});
	});



	// Queue processing disabled while using direct remote calls
	// try { await processQueueInClient(); } catch (e) { Err.UNHANDLED(e); }

	// Route based on auth status
	if (finalAuthState.status === "signed-in") {
		// User is authenticated - hydrate their data and allow access to app
		await tasksAPI.hydrateForUser({ user: finalAuthState.user });
	} else if (finalAuthState.status === "signed-out") {
		// User is not authenticated
		const isAuthPage = url.pathname === '/login' || url.pathname === '/register';
		console.log("workos sign in");

		await authkit.signIn();
		return;
		if (!isAuthPage) {
			// Don't redirect to the same page to avoid infinite loops
			const redir = encodeURIComponent(url.pathname + url.search);
			throw redirect(302, `/login?redirect=${redir}`);
		}
	} else if (finalAuthState.status === 'error') {
		// TODO:UX Add error page
		console.error(finalAuthState.error);
		// await authkit.signIn();
		// throw redirect(302, `/login`);
	}
};