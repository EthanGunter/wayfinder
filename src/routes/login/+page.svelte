<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { isAnonymous } from '$lib/API/Auth/User';
	import type { LoginCredentials } from '$lib/API/Auth/types';
	import { ArgumentError, ErrorType, InputRequiredError } from '$lib/Errors';
	import { SupabaseAuthError } from '$lib/API/Auth/SupabaseAuthProvider.js';

	let redir = page.url.searchParams.get('redirectTo') || '/home';
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
			} else if (result.error instanceof SupabaseAuthError) {
				if (result.error.code === 'user_already_exists') {
					errorMessage = 'User already exists'; // TODO should we just login
				} else {
					errorMessage = result.error.msg || 'Registration failed';
				}
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

<div class="login-page">
	<div class="login-container">
		{#if navigator.onLine}
			<h1>{isRegistering ? 'Create Account' : 'Login'}</h1>

			{#if errorMessage}
				<div class="error-message">
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
					<div class="form-group">
						<label for="displayName">Display Name</label>
						<input
							id="displayName"
							type="text"
							bind:value={displayName}
							placeholder="Enter your name"
							required
						/>
					</div>
				{/if}

				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="Enter your email"
						required
					/>
				</div>

				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="Enter your password"
						required
					/>
				</div>

				<button type="submit" class="btn-primary" disabled={isLoading}>
					{isLoading ? 'Please wait...' : isRegistering ? 'Create Account' : 'Login'}
				</button>
			</form>

			<div class="toggle-mode">
				<button type="button" class="btn-link" onclick={toggleMode}>
					{isRegistering ? 'Already have an account? Login' : "Don't have an account? Create one"}
				</button>
			</div>
		{:else}
			<h1>Offline</h1>

			{#if errorMessage}
				<div class="error-message">
					{errorMessage}
				</div>
			{/if}
			<div class="error-message">
				<p>Unable to manage account without an internet connection</p>
			</div>

			<br />
		{/if}

		<div class="back-to-app">
			<button type="button" class="btn-secondary" onclick={() => goto(redir ?? '/home')}>
				Back to App
			</button>
		</div>
	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--background-modifier-hover, #f8f9fa);
		padding: 1rem;
	}

	.login-container {
		background: white;
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		width: 100%;
		max-width: 400px;
	}

	h1 {
		text-align: center;
		margin-bottom: 2rem;
		color: var(--color-text, #333);
	}

	.error-message {
		background: #fee;
		color: #c33;
		padding: 0.75rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		border: 1px solid #fcc;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		color: var(--color-text, #333);
		font-weight: 500;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border, #ddd);
		border-radius: 4px;
		font-size: 1rem;
		box-sizing: border-box;
	}

	input:focus {
		outline: none;
		border-color: var(--color-accent, #007acc);
		box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
	}

	.btn-primary {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-accent, #007acc);
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		margin-bottom: 1rem;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent-hover, #005a9e);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		width: 100%;
		padding: 0.75rem;
		background: transparent;
		color: var(--color-text, #333);
		border: 1px solid var(--color-border, #ddd);
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	.btn-secondary:hover {
		background: var(--background-modifier-hover, #f0f0f0);
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-accent, #007acc);
		cursor: pointer;
		text-decoration: underline;
		font-size: 0.9rem;
	}

	.btn-link:hover {
		color: var(--color-accent-hover, #005a9e);
	}

	.toggle-mode {
		text-align: center;
		margin-bottom: 1rem;
	}

	.back-to-app {
		text-align: center;
	}
</style>
