<script lang="ts">
	import '../app.css';
	import { authState } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';

	const { children } = $props();
	let isLogin = $state(false);
	let isRegister = $state(false);
	let isAuthPage = $derived(isLogin || isRegister);

	// Reactive effect that responds to auth state changes
	$effect(() => {
		const state = $authState;
		console.log('[TODO:debug EG] +layout.svelte: authState changed to', state.status); // TODO:debug EG
		const currentPath = page.url.pathname;
		isLogin = currentPath === '/login';
		isRegister = currentPath === '/register';

		if (state.status === 'loading') {
			console.log('[root/+layout] auth loading');
		} else if (state.status === 'signed-in') {
			console.log('[root/+layout] auth signed in');

			// User is authenticated - hydrate their data and allow access to app
			tasksAPI.hydrateForUser({ user: state.user });

			// If on auth pages, redirect to the app
			if (isAuthPage) {
				const redirect = page.url.searchParams.get('redirect');
				goto(redirect || '/planner');
			}
		} else if (state.status === 'signed-out') {
			console.log('[root/+layout] auth signed out');
			if (!isAuthPage) {
				goto('/login');
			}
		} else if (state.status === 'error') {
			// TODO:UX Add error page
			console.error('[root/+layout] auth error:', state.error);
			// await authkit.signIn();

			if (!isAuthPage) {
				goto('/login');
			}
		}
	});
</script>

<div class="absolute top-0 left-0 h-screen w-screen">
	{#if $authState.status === 'loading'}
		<div class="flex h-screen w-full items-center justify-center">
			<Icon icon="lucide:loader-circle" class="size-10 animate-spin" />
		</div>
		<!-- {:else if $authState.status === 'signed-in'} -->
	{:else}
		{@render children?.()}
	{/if}
</div>
