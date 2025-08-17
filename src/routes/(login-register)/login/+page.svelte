<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import type { ILocalAuth, LoginCredentials } from '$lib/API/Auth/types';
	import { InputRequiredError } from '$lib/Errors';
	import { Button } from '@/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import { isAnonymous, type User } from '@/API/Auth/User';
	import Icon from '@iconify/svelte';

	let auth = $state<ILocalAuth>();

	let redir = page.url.searchParams.get('redirect') || '/home';
	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isLoading = $state(false);

	onMount(async () => {
		auth = await authAPIPromise;
	});

	async function handleLogin() {
		if (!auth) return;

		isLoading = true;
		errorMessage = '';

		try {
			const creds: LoginCredentials = { type: 'email_password', email, password };
			const result = await auth.login({ creds });

			if (result.isOk()) {
				// Login successful, refresh and redirect
				await invalidateAll();
				goto(redir);
			} else {
				if (result.error instanceof InputRequiredError && result.error.context?.requiresMigration) {
					// Special case: anonymous user has local data, need migration decision
					errorMessage =
						'You have local data that needs to be migrated. Please use the migration options in the app.';
				} else {
					errorMessage = result.error.msg || 'Login failed';
				}
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('Login error:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

<h1 class="text-center text-gray-800">Login</h1>
{#if errorMessage}
	<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
		{errorMessage}
	</div>
{/if}

<form
	onsubmit={(e) => {
		e.preventDefault();
		handleLogin();
	}}
>
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

	<Button
		type="submit"
		class="mb-4 w-full cursor-pointer rounded border-none bg-blue-500 p-3 text-base font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
		disabled={isLoading}
	>
		{isLoading ? 'Please wait...' : 'Login'}
	</Button>
</form>

<div class="mb-4 text-center">
	<Button
		type="button"
		variant="outline"
		class="cursor-pointer border-none bg-none text-sm text-blue-500 underline hover:text-blue-600"
		onclick={() => goto(`/register?redirect=${redir}`)}
	>
		Create a new account
	</Button>
</div>
