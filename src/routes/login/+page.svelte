<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { isAnonymous } from '$lib/API/Auth/User';
	import type { LoginCredentials } from '$lib/API/Auth/types';
	import { ArgumentError, ErrorType, InputRequiredError } from '$lib/Errors';
	import { Button } from '@/components/ui/button';
	// import { SupabaseAuthError } from '$lib/API/Auth/SupabaseAuthProvider.js';

	let redir = page.url.searchParams.get('redirect') || '/home';
	let email = $state('');
	let password = $state('');
	let displayName = $state('');

	let isRegistering = $state(page.url.searchParams.has('register') || false);
	let errorMessage = $state('');
	let isLoading = $state(false);

	// Get auth from parent layout
	const { data } = $props();
	const auth = data?.auth;

	if (!auth) {
		goto('/home');
	}

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

<div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
	<div class="bg-white p-8 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] w-full max-w-md">
		{#if navigator.onLine}
			<h1 class="text-center mb-8 text-gray-800">{isRegistering ? 'Create Account' : 'Login'}</h1>

			{#if errorMessage}
				<div class="bg-red-50 text-red-700 p-3 rounded mb-4 border border-red-200">
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
						<label for="displayName" class="block mb-2 text-gray-800 font-medium">Display Name</label>
						<input
							id="displayName"
							type="text"
							bind:value={displayName}
							placeholder="Enter your name"
							required
							class="w-full p-3 border border-gray-300 rounded text-base box-border focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)]"
						/>
					</div>
				{/if}

				<div class="mb-4">
					<label for="email" class="block mb-2 text-gray-800 font-medium">Email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="Enter your email"
						required
						class="w-full p-3 border border-gray-300 rounded text-base box-border focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)]"
					/>
				</div>

				<div class="mb-4">
					<label for="password" class="block mb-2 text-gray-800 font-medium">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="Enter your password"
						required
						class="w-full p-3 border border-gray-300 rounded text-base box-border focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)]"
					/>
				</div>

				<Button type="submit" class="w-full p-3 bg-blue-500 text-white border-none rounded text-base font-medium cursor-pointer mb-4 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed" disabled={isLoading}>
					{isLoading ? 'Please wait...' : isRegistering ? 'Create Account' : 'Login'}
				</Button>
			</form>

			<div class="text-center mb-4">
				<Button type="button" class="bg-none border-none text-blue-500 cursor-pointer underline text-sm hover:text-blue-600" onclick={toggleMode}>
					{isRegistering ? 'Already have an account? Login' : "Don't have an account? Create one"}
				</Button>
			</div>
		{:else}
			<h1 class="text-center mb-8 text-gray-800">Offline</h1>

			{#if errorMessage}
				<div class="bg-red-50 text-red-700 p-3 rounded mb-4 border border-red-200">
					{errorMessage}
				</div>
			{/if}
			<div class="bg-red-50 text-red-700 p-3 rounded mb-4 border border-red-200">
				<p>Unable to manage account without an internet connection</p>
			</div>

			<br />
		{/if}

		<div class="text-center">
			<Button type="button" class="w-full p-3 bg-transparent text-gray-800 border border-gray-300 rounded text-base cursor-pointer hover:bg-gray-50" onclick={() => goto(redir ?? '/home')}>
				Back to App
			</Button>
		</div>
	</div>
</div>
