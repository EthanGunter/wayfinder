<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import type { ILocalAuth, LoginCredentials } from '$lib/API/Auth/types';
	import { Button } from '@/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPIPromise } from '@/stores/services';
	import { isAnonymous, type LocalUser } from '@/API/Auth/User';
	import UserAvatar from '@/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';

	let auth = $state<ILocalAuth>();
	let users = $state<LocalUser[]>([]);
	let currentUser = $state<LocalUser | null>(null);
	let redir = page.url.searchParams.get('redirect') || '/home';
	let errorMessage = $state('');
	let isLoading = $state(false);
	let email = $state('');
	let password = $state('');
	let showMigrationPrompt = $state<{ anonId: string; remoteUserId: string } | null>(null);

	onMount(async () => {
		auth = await authAPIPromise;
		await loadUsers();
	});

	async function loadUsers() {
		if (!auth) return;
		
		try {
			const allUsers = await auth.listUsers();
			// Sort users alphabetically by display name
			users = allUsers.sort((a, b) => a.display_name.localeCompare(b.display_name));
			currentUser = await auth.getActiveUser();
		} catch (error) {
			errorMessage = 'Failed to load users';
			console.error('Error loading users:', error);
		}
	}

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
			} else {
				errorMessage = result.error.msg || 'Failed to switch user';
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('User switch error:', error);
		} finally {
			isLoading = false;
		}
	}

	async function createNewUser() {
		// For now, just redirect to register page
		goto(`/register?redirect=${redir}`);
	}

	async function handleRemoteLogin() {
		if (!auth || isLoading) return;
		isLoading = true;
		errorMessage = '';

		try {
			const creds: LoginCredentials = { type: 'email_password', email, password };
			const result = await auth.login({ creds });
			if (result.isOk()) {
				await invalidateAll();
				goto(redir);
			} else {
				const e: any = result.error;
				if (e?.data?.requiresMigration) {
					showMigrationPrompt = { anonId: e.data.anonymousUserId, remoteUserId: e.data.remoteUserId };
				} else {
					errorMessage = e?.message || 'Login failed';
				}
			}
		} catch (e) {
			errorMessage = 'An unexpected error occurred';
			console.error('Remote login error:', e);
		} finally {
			isLoading = false;
		}
	}

	async function confirmMigration(accept: boolean) {
		if (!auth || !showMigrationPrompt) { showMigrationPrompt = null; return; }
		const { anonId, remoteUserId } = showMigrationPrompt;
		showMigrationPrompt = null;
		try {
			if (!accept) {
				await auth.deleteUser({ userId: anonId });
			}
			await auth.switchUser(remoteUserId);
			await invalidateAll();
			goto(redir);
		} catch (e) {
			console.error('Migration handling failed', e);
			errorMessage = 'Migration failed';
		}
	}
</script>

<h1 class="text-center text-gray-800">{currentUser ? 'Switch User' : 'Login'}</h1>
{#if errorMessage}
	<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
		{errorMessage}
	</div>
{/if}

<!-- Remote login -->
<div class="mb-6 space-y-3">
	<label class="block text-sm text-gray-600">Email</label>
	<input type="email" bind:value={email} class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none" />
	<label class="block text-sm text-gray-600">Password</label>
	<input type="password" bind:value={password} class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none" />
	<Button class="w-full" onclick={handleRemoteLogin} disabled={isLoading}>{isLoading ? 'Please wait...' : 'Sign in'}</Button>
</div>

{#if showMigrationPrompt}
	<div class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800">
		Local data from a guest user was detected. Migrate data to this account?
		<div class="mt-2 flex gap-2">
			<Button variant="outline" onclick={() => confirmMigration(true)}>Migrate</Button>
			<Button variant="outline" onclick={() => confirmMigration(false)}>Discard</Button>
		</div>
	</div>
{/if}

{#if users.length === 0}
	<div class="mb-4 rounded border border-gray-200 bg-gray-50 p-4 text-center text-gray-600">
		<Icon icon="mdi:account-plus" class="mb-2 text-2xl" />
		<p class="mb-2">No users found.</p>
		<Button onclick={createNewUser} class="text-sm">
			Create your first user
		</Button>
	</div>
{:else}
	<div class="mb-4">
		<p class="mb-3 text-sm text-gray-600">Select a user to continue:</p>
		<div class="space-y-2">
			{#each users as user (user.id)}
				<button
					onclick={() => handleUserSwitch(user.id)}
					disabled={isLoading}
					class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id === user.id ? 'border-blue-500 bg-blue-50' : ''}"
				>
					<UserAvatar {user} class="h-10 w-10" />
					<div class="flex-1">
						<div class="font-medium text-gray-900">
							{user.display_name}
							{#if isAnonymous(user)}
								<span class="text-xs text-gray-500">(Guest)</span>
							{/if}
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

	<div class="mb-4 text-center">
		<Button
			type="button"
			variant="outline"
			class="cursor-pointer border-none bg-none text-sm text-blue-500 underline hover:text-blue-600"
			onclick={createNewUser}
		>
			Create a new user
		</Button>
	</div>
{/if}
