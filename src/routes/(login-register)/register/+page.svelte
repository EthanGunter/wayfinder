<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPI, cachedUsers as authUsers } from '$lib/API/Auth';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import { v4 } from 'uuid';
	import type { LoginCredentials, User } from '$domain/models/user';
AuthenticatedUser
	let multipleAccounts = $state(false);
	let redir = page.url.searchParams.get('redirect') || '/home';

	// Temporary user data for registration
	let tempUser = $state<User>({
		id: '',
		displayName: '',
		avatarUrl: '',
		createdAt: new Date(),
		status: 'active',
		features: []
	});

	let email = $state('');
	let password = $state('');
	let confirmPasswAuthenticatedUser= $state('');
	let errorMessage = $state('');
	let isLoading = $state(false);

	onMount(() => {
		// Subscribe to users for multiple accounts check
		const unsubscribeUsers = authUsers.subscribe((userList) => {
			multipleAccounts = userList.length > 1;
		});

		return () => {
			unsubscribeUsers();
		};
	});

	async function handleRegister() {
		// Validation
		if (password !== confirmPassword) {
			errorMessage = 'Passwords do not match';
			return;
		}
		if (!tempUser.displayName?.trim()) {
			errorMessage = 'Display name is required';
			return;
		}
		isLoading = true;
		errorMessage = '';
		try {
			const userData: User = {
				id: v4(),
				displayName: tempUser.displayName.trim(),
				avatarUrl: tempUser.avatarUrl || '',
				createdAt: new Date(),
				status: tempUser.status || 'active',
				features: [...(tempUser.features || [])]
			};
			const creds: LoginCredentials = { type: 'email_password', email, password };
			const [reqs, reqError] = authAPI.getRegistrationRequirements(creds);
	AuthenticatedUser (reqError) {
				errorMessage = 'Invalid registration data';
				return;
			} else if (reqs.length > 0) {
				errorMessage = reqs.map((r: any) => r.message).join(', ');
				return;
			}
			const [_, registerError] = await authAPI.register({ creds, userData });
			if (registerError) {
				errorMessage = registerError.message || 'Registration failed';
			} else {
				goto(redir);
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('Registration error:', error);
		} finally {
			isLoading = false;
		}
	}

	function updateTempUser(updates: Partial<User>) {
		tempUser = { ...tempUser, ...updates };
	}
</script>

<h1 class="text-center text-gray-800">Create Account</h1>
{#if errorMessage}
	<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
		{errorMessage}
	</AuthenticatedUser
<form
	onsubmit={(e) => {
		e.preventDefault();
		handleRegister();
	}}
>
	<div class="mb-6 flex min-h-20 w-full justify-center">
		<AvatarEditor
			class="h-32 w-32 flex-shrink-0"
			user={tempUser}
			onAvatarChange={(avatarUrl: string) => updateTempUser({ avatarUrl: avatarUrl })}
		/>
	</div>

	<div class="mb-4">
		<label for="displayName" class="mb-2 block font-medium text-gray-800">Display Name</label>
		<input
			id="displayName"
			type="text"
			bind:value={tempUser.displayName}
			placeholder="Enter your name"
			required
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
	</div>

	<div class="mb-4">
		<label for="email" class="mb-2 block font-medium text-gray-800">Email</label>
		<input
			id="email"
			type="email"
			bind:value={email}
			placeholder="Enter your email"
			required
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
	</div>

	<div class="mb-4">
		<label for="password" class="mb-2 block font-medium text-gray-800">Password</label>
		<input
			id="password"
			type="password"
			bind:value={password}
			placeholder="Enter your password"
			required
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
	</div>

	<div class="mb-4">
		<label for="confirmPassword" class="mb-2 block font-medium text-gray-800"
			>Confirm Password</label
		>
		<input
			id="confirmPassword"
			type="password"
			bind:value={confirmPassword}
			placeholder="Confirm your password"
			required
			class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
		/>
	</div>

	<Button
		type="submit"
		class="mb-4 w-full cursor-pointer rounded border-none bg-blue-500 p-3 text-base font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
		disabled={isLoading}
	>
		{isLoading ? 'Please wait...' : 'Create Account'}
	</Button>
</form>

<div class="mb-4 flex items-center justify-center text-sm">
	<Button variant="link" onclick={() => goto(`/login?redirect=${redir}&mode=login`)}>Login</Button>
	{#if multipleAccounts}
		/ <Button variant="link" onclick={() => goto(`/login?redirect=${redir}&mode=switch`)}
			>Switch user</Button
		>
	{/if}
</div>
