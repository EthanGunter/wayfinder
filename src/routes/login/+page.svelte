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
	// import { SupabaseAuthError } from '$lib/API/Auth/SupabaseAuthProvider.js';

	let auth = $state<ILocalAuth>();
	let user = $state<User>();
	let hasTasks = $state(false);
	let multipleUsers = $state(false);

	let redir = page.url.searchParams.get('redirect') || '/home';
	let email = $state('');
	let password = $state('');
	let displayName = $state('');

	let isRegistering = $state(page.url.searchParams.has('register') || false);
	let errorMessage = $state('');
	let isLoading = $state(false);

	onMount(async () => {
		auth = await authAPIPromise;
		user = (await auth.getActiveUser()) ?? undefined;

		multipleUsers = (await auth.listUsers()).length > 1;
		const tasks = await taskAPIPromise;
		const roots = await tasks.getRootTasks();
		hasTasks = roots._unsafeUnwrap().length > 0;
	});

	async function handleRegister() {
		if (!auth) return;

		isLoading = true;
		errorMessage = '';

		try {
			// Create user data for registration
			const userData = {
				id: '', // Will be set by the auth provider
				display_name: displayName || email.split('@')[0], // Use email prefix as default name
				avatar_url: '',
				created_at: new Date().toISOString(),
				status: 'active' as const,
				features: [] as string[]
			};

			const creds: LoginCredentials = { type: 'email_password', email, password };

			// Check registration requirements first
			const reqsResult = auth.getRegistrationRequirements(creds);
			if (reqsResult.isErr()) {
				errorMessage = 'Invalid registration data';
				return;
			} else if (reqsResult.value.length > 0) {
				errorMessage = reqsResult.value.map((r: any) => r.message).join(', ');
				return;
			}

			const result = await auth.register({ creds, userData });

			if (result.isOk()) {
				// Registration successful, refresh and redirect
				await invalidateAll();
				goto(redir);
				/* } else if (result.error instanceof SupabaseAuthError) {
				if (result.error.code === 'user_already_exists') {
					errorMessage = 'User already exists'; // TODO should we just login
				} else {
					errorMessage = result.error.msg || 'Registration failed';
				} */
			} else {
				errorMessage = result.error.msg || 'Registration failed';
			}
		} catch (error) {
			errorMessage = 'An unexpected error occurred';
			console.error('Registration error:', error);
		} finally {
			isLoading = false;
		}
	}

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

	function toggleMode() {
		isRegistering = !isRegistering;
		errorMessage = '';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
		<!-- 		{#if navigator.onLine}
 -->
		<h1 class="text-center text-gray-800">{isRegistering ? 'Create Account' : 'Login'}</h1>
		{#if user && isAnonymous(user) && hasTasks}
			<p class="mb-8 text-center text-sm text-gray-500">
				(Don't worry, all your data will come with you)
			</p>
		{/if}
		{#if errorMessage}
			<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
				{errorMessage}
			</div>
		{/if}

		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (isRegistering) {
					handleRegister();
				} else {
					handleLogin();
				}
			}}
		>
			{#if isRegistering}
				<div class="mb-4">
					<label for="displayName" class="mb-2 block font-medium text-gray-800">Display Name</label>
					<input
						id="displayName"
						type="text"
						bind:value={displayName}
						placeholder="Enter your name"
						required
						class="box-border w-full rounded border border-gray-300 p-3 text-base focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none"
					/>
				</div>
			{/if}

			<!-- 				<div class="mb-4">
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
				</div> -->

			<Button
				type="submit"
				class="mb-4 w-full cursor-pointer rounded border-none bg-blue-500 p-3 text-base font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isLoading}
			>
				{isLoading ? 'Please wait...' : isRegistering ? 'Create Account' : 'Login'}
			</Button>
		</form>

		{#if multipleUsers}
			<div class="mb-4 text-center">
				<Button
					type="button"
					class="cursor-pointer border-none bg-none text-sm text-blue-500 underline hover:text-blue-600"
					onclick={toggleMode}
				>
					{isRegistering ? 'Already have an account? Login' : "Don't have an account? Create one"}
				</Button>
			</div>
		{/if}
		<!-- {:else}
			<h1 class="mb-8 text-center text-gray-800">Offline</h1>

			{#if errorMessage}
				<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
					{errorMessage}
				</div>
			{/if}
			<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
				<p>Unable to manage account without an internet connection</p>
			</div>

			<br />
		{/if} -->

		<div class="text-center">
			<Button
				type="button"
				class="w-full cursor-pointer rounded border border-gray-300 bg-transparent p-3 text-base text-gray-800 hover:bg-gray-50"
				onclick={() => goto(redir ?? '/home')}
			>
				Back to App
			</Button>
		</div>
	</div>
</div>
