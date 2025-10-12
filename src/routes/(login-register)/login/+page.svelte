<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { authAPI, authState } from '$lib/API/Auth';
	import { ArgumentError, Err } from '$domain/errors';
	import type { LoginCredentials } from '$domain/models/user';

	let redir = page.url.searchParams.get('redirect') || '/';
	let errorMessage = $state('');
	let isLoading = $state(false);
	let email = $state('');
	let password = $state('');

	async function handleRemoteLogin() {
		if (!authAPI || isLoading || !email.trim() || !password.trim()) return;
		isLoading = true;
		errorMessage = '';

		const creds: LoginCredentials = { type: 'email_password', email, password };
		const [user, error] = await authAPI.login(creds);

		if (user) {
			// Clear credentials on success
			email = '';
			password = '';
			goto(redir);
		} else {
			if (error instanceof ArgumentError) {
				errorMessage = error.message;
				console.error(error);
			} else {
				// TODO:Temp anonymous accounts disabled
				if (false /* error?.data?.requiresMigration */) {
				} else {
					errorMessage = 'Login failed';
					Err.UNHANDLED(error);
				}
			}
		}
		isLoading = false;
	}

	console.log($authState.status);

	// TEMP: Login with hosted WorkOS UI
	authAPI.login({ type: 'external' });
</script>

<!-- TEMP: Prefer workos hosted UI for now -->
{#if false}
	<h1 class="text-center text-gray-800">Login</h1>
	{#if errorMessage}
		<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
			{errorMessage}
		</div>
	{/if}

	<form class="mb-6 space-y-3" onsubmit={handleRemoteLogin}>
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
		<Button class="w-full" type="submit" disabled={isLoading}>
			{isLoading ? 'Please wait...' : 'Sign in'}
		</Button>
	</form>
	<div class="mb-4 flex items-center justify-center text-sm">
		<Button variant="link" onclick={() => goto(`/register?redirect=${redir}`)}>Register</Button>
	</div>
{/if}
