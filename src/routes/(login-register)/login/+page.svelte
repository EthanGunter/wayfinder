<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import type { LoginCredentials } from '$lib/API/Auth/types';
	import { Button } from '@/components/ui/button';
	import { onMount } from 'svelte';
	import { auth, authState, users as authUsers } from '@/API/Auth/BrowserAuthProvider';
	import { type LocalUser } from '@/API/Auth/User';
	import UserAvatar from '@/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';
	import { Err, InputRequiredError } from '@/Errors';

	let users = $state<LocalUser[]>([]);
	let currentUser = $derived($authState.status === 'signed-in' ? $authState.user : null);
	let redir = page.url.searchParams.get('redirect') || '/home';
	let errorMessage = $state('');
	let isLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let mode = $state<'login' | 'switch'>('login');

	onMount(() => {
		const unsubscribeUsers = authUsers.subscribe((userList) => {
			// Sort users alphabetically by display name
			users = userList.sort((a, b) => a.display_name.localeCompare(b.display_name));
			// Determine initial mode: explicit query param wins; otherwise default to 'switch' if users exist
			const qpMode = page.url.searchParams.get('mode');
			if (users.length === 0) mode = 'login';
			else if (qpMode === 'switch' || qpMode === 'login') mode = qpMode;
			else if (!page.url.searchParams.get('mode')) {
				mode = users.length > 0 ? 'switch' : 'login';
			}
		});

		return () => {
			unsubscribeUsers();
		};
	});

	async function handleUserSwitch(userId: string) {
		if (!auth || isLoading) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await auth.switchUser(userId);

			if (result.isOk()) {
				// Switch successful, refresh and redirect
				await invalidateAll();
				goto(redir);
			} else if (result.error instanceof InputRequiredError) {
				// Require login for this account: show login form with message
				mode = 'login';
				const u = users.find((u) => u.id === userId);
				errorMessage = u
					? `Please sign in to continue as ${u.display_name}.`
					: 'Login required to access this account.';
			} else {
				Err.UNHANDLED(result.error);
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('User switch error:', error);
		} finally {
			isLoading = false;
		}
	}

	async function handleRemoteLogin() {
		if (!auth || isLoading || !email.trim() || !password.trim()) return;
		isLoading = true;
		errorMessage = '';

		try {
			const creds: LoginCredentials = { type: 'email_password', email, password };
			const result = await auth.login({ creds });
			if (result.isOk()) {
				// Clear credentials on success
				email = '';
				password = '';
				await invalidateAll();
				goto(redir);
			} else {
				const error = result.error;
				// TODO:Temp anonymous accounts disabled
				if (false /* error?.data?.requiresMigration */) {
				} else {
					errorMessage = 'Login failed';
					Err.UNHANDLED(result.error);
				}
			}
		} catch (e) {
			errorMessage = 'An unexpected error occurred';
			console.error('Remote login error:', e);
		} finally {
			isLoading = false;
		}
	}
</script>

<h1 class="text-center text-gray-800">{mode === 'switch' ? 'Switch User' : 'Login'}</h1>
{#if errorMessage}
	<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
		{errorMessage}
	</div>
{/if}

{#if mode === 'switch'}
	<div class="mb-4">
		<p class="mb-3 text-sm text-gray-600">Select a user to continue:</p>
		<div class="space-y-2">
			{#each users as user (user.id)}
				<button
					onclick={() => handleUserSwitch(user.id)}
					disabled={isLoading}
					class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id ===
					user.id
						? 'border-blue-500 bg-blue-50'
						: ''}"
				>
					<UserAvatar {user} class="h-10 w-10" />
					<div class="flex-1">
						<div class="font-medium text-gray-900">
							{user.display_name}
						</div>
						{#if currentUser?.id === user.id}
							<div class="text-xs text-blue-600">Currently active</div>
						{/if}
					</div>
					{#if isLoading}
						<Icon icon="mdi:loading" class="animate-spin text-gray-400" />
					{:else}
						<Icon icon="mdi:chevron-right" class="text-gray-400" />
					{/if}
				</button>
			{/each}
		</div>
	</div>
	<div class="mb-4 flex items-center justify-center text-sm">
		<Button variant="link" onclick={() => goto(`/register?redirect=${redir}`)}>Register</Button> /
		<Button variant="link" onclick={() => (mode = 'login')}>Login</Button>
	</div>
{:else}
	<div class="mb-6 space-y-3">
		<label for="email" class="block text-sm text-gray-600">Email</label>
		<input
			name="email"
			type="email"
			bind:value={email}
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
		<label for="password" class="block text-sm text-gray-600">Password</label>
		<input
			name="password"
			type="password"
			bind:value={password}
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
		<Button class="w-full" onclick={handleRemoteLogin} disabled={isLoading}
			>{isLoading ? 'Please wait...' : 'Sign in'}</Button
		>
	</div>
	<div class="mb-4 flex items-center justify-center text-sm">
		<Button variant="link" onclick={() => goto(`/register?redirect=${redir}`)}>Register</Button>
		{#if users.length > 0}
			/ <Button variant="link" onclick={() => (mode = 'switch')}>Switch user</Button>
		{/if}
	</div>
{/if}
