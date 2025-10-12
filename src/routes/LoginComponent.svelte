<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPI, authState, cachedUsers as authUsers, cachedUsers } from '$lib/API/Auth';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';
	import { Err, InputRequiredError } from '$domain/errors';
	import type { LocalUser } from '$domain/models/user';
	import { authkit } from '$lib/API/WorkOSAuthKit';

	let currentUser = $derived($authState.status === 'signed-in' ? $authState.user : null);
	let redir = page.url.searchParams.get('redirect') || '/';
	let errorMessage = $state('');

	if ($cachedUsers.length === 0) goto('/login');

	async function handleUserSwitch(userId: string) {
		errorMessage = '';

		try {
			const [newUser, error] = await authAPI.switchUser(userId);
			console.log(newUser, error);

			if (newUser) {
				// Switch successful, redirect
				goto(redir);
			} else if (error instanceof InputRequiredError) {
				// Require login for this account: redirect to login with message
				const u = $cachedUsers.find((u) => u.id === userId);
				const message = u
					? `Please sign in to continue as ${u.displayName}.`
					: 'Login required to access this account.';
				// TODO: Pass error message to login route
				goto(`/login?redirect=${redir}`);
			} else {
				Err.UNHANDLED(error);
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('User switch error:', error);
		}
	}
</script>

<h1 class="text-center text-gray-800">Switch User</h1>

{#if errorMessage}
	<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
		{errorMessage}
	</div>
{/if}

<div class="mb-4">
	<p class="mb-3 text-sm text-gray-600">Select a user to continue:</p>
	<div class="space-y-2">
		{#each $cachedUsers as user (user.id)}
			<button
				onclick={() => handleUserSwitch(user.id)}
				disabled={$authState.status === 'loading'}
				class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id ===
				user.id
					? 'border-blue-500 bg-blue-50'
					: ''}"
			>
				<UserAvatar {user} class="h-10 w-10" />
				<div class="flex-1">
					<div class="font-medium text-gray-900">
						{user.displayName}
					</div>
					{#if currentUser?.id === user.id}
						<div class="text-xs text-blue-600">Currently active</div>
					{/if}
				</div>
				{#if $authState.status === 'loading'}
					<Icon icon="mdi:loading" class="animate-spin text-gray-400" />
				{:else}
					<Icon icon="mdi:chevron-right" class="text-gray-400" />
				{/if}
			</button>
		{/each}
	</div>
</div>

<div class="mb-4 flex items-center justify-center gap-2 text-sm">
	<Button
		variant="link"
		onclick={async () => {
			console.log('[TODO:debug EG] switch-user → login: checking if signed in'); // TODO:debug EG
			// Logout first if signed in, but keep cached session data
			if ($authState.status === 'signed-in') {
				console.log('[TODO:debug EG] switch-user → login: logging out (keepCached=true)'); // TODO:debug EG
				await authAPI.logout({ keepCached: true });
			}
			console.log('[TODO:debug EG] switch-user → login: calling WorkOS signIn'); // TODO:debug EG
			authkit.signIn();
		}}
	>
		Login
	</Button>
	<span class="text-gray-400">/</span>
	<Button
		variant="link"
		onclick={async () => {
			console.log('[TODO:debug EG] switch-user → register: checking if signed in'); // TODO:debug EG
			// Logout first if signed in, but keep cached session data
			if ($authState.status === 'signed-in') {
				console.log('[TODO:debug EG] switch-user → register: logging out (keepCached=true)'); // TODO:debug EG
				await authAPI.logout({ keepCached: true });
			}
			console.log('[TODO:debug EG] switch-user → register: calling WorkOS signUp'); // TODO:debug EG
			authkit.signUp();
		}}
	>
		Register
	</Button>
</div>
