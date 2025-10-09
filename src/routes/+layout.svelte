<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from 'convex-svelte';
	import '../app.css';
	import { authState } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	const { children } = $props();

	// Reactive effect that responds to auth state changes
	$effect(() => {
		const state = $authState;
		const currentPath = $page.url.pathname;
		const isAuthPage = currentPath === '/login' || currentPath === '/register';

		if (state.status === 'loading') {
			console.log('auth loading');
			return;
		}

		if (state.status === 'signed-in') {
			console.log('auth signed in');

			// User is authenticated - hydrate their data and allow access to app
			tasksAPI.hydrateForUser({ user: state.user });

			// Optionally redirect away from auth pages if already signed in
			if (isAuthPage) {
				goto('/home');
			}
		} else if (state.status === 'signed-out') {
			console.log('auth signed out');

			/**
			 * TODO this is supposed to send to WorkOS hosted login ui,
			 * but since we don't handle the response,
			 * if the user is logged in we get stuck in an infinite loop
			 */
			// await authkit.signIn();

			if (!isAuthPage) {
				// Don't redirect to the same page to avoid infinite loops
				const redir = encodeURIComponent(currentPath + $page.url.search);
				goto(`/login${currentPath === '/' ? '' : '?redirect=' + redir}`);
			}
		} else if (state.status === 'error') {
			// TODO:UX Add error page
			console.error('auth error:', state.error);
			// await authkit.signIn();

			if (!isAuthPage) {
				goto('/login');
			}
		}
	});

	// setupConvex(PUBLIC_CONVEX_URL);
</script>

<div class="absolute top-0 left-0 h-screen w-screen">
	{@render children?.()}
</div>
