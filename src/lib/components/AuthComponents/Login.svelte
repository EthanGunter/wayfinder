<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { authAPI, authState } from '$lib/API/Auth';
	import type { Err } from '$domain/errors';

	interface Props {
		onError?: (message: string, error?: Err) => void;
	}

	const { onError }: Props = $props();

	let email = $state('');
	let password = $state('');

	// goto('/dev/auth');

	let redir = page.url.searchParams.get('redirect') || '/';
	let errorMessage = $state('');
	let testOutput = $state('');

	async function handleLogin() {
		testOutput = 'Initiating GitHub login...';
		try {
			const result = await authAPI.login({ type: 'external' });
			if (result[0]) {
				testOutput = '✓ Login initiated successfully';
			} else {
				testOutput = `✗ Login error: ${result[1]?.message}`;
			}
		} catch (e: any) {
			testOutput = `✗ Login exception: ${e.message}`;
		}
	}

	async function handleEmailLogin() {
		testOutput = 'Signing in with email...';
		try {
			const [_, error] = await authAPI.login({ type: 'email_password', email, password });
			if (error) {
				testOutput = `✗ Email sign-in error: ${error.message}`;
			} else {
				testOutput = '✓ Email sign-in initiated';
			}
		} catch (e: any) {
			testOutput = `✗ Email sign-in exception: ${e.message}`;
		}

		goto(redir || '/planner');
	}

	async function handleLogout() {
		testOutput = 'Logging out...';
		try {
			await authAPI.logout();
			testOutput = '✓ Logged out successfully';
		} catch (e: any) {
			testOutput = `✗ Logout exception: ${e.message}`;
		}
	}

	function checkAuthState() {
		testOutput = `Auth State: ${JSON.stringify($authState, null, 2)}`;
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-center text-3xl font-bold text-gray-800">Auth Test Page</h1>

	<!-- Auth State Display -->
	<div class="mb-6 rounded-lg border border-gray-300 bg-gray-50 p-4">
		<h2 class="mb-2 font-semibold">Current Auth State:</h2>
		<div class="font-mono text-sm">
			<div>Status: <strong>{$authState.status}</strong></div>
			{#if $authState.status === 'signed-in'}
				<div>User ID: {$authState.user.id}</div>
				<div>Display Name: {$authState.user.displayName}</div>
				<div>Avatar: {$authState.user.avatarUrl || 'none'}</div>
			{/if}
		</div>
	</div>

	<!-- Test Buttons -->
	<div class="mb-6 space-y-3">
		<Button class="w-full" onclick={handleLogin}>🔐 Login with GitHub (OAuth)</Button>

		<div class="rounded border border-gray-200 p-3">
			<div class="mb-2 font-medium">Email / Password</div>
			<div class="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
				<input
					class="w-full rounded border p-2"
					type="email"
					placeholder="email@example.com"
					bind:value={email}
				/>
				<input
					class="w-full rounded border p-2"
					type="password"
					placeholder="password"
					bind:value={password}
				/>
			</div>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<Button class="w-full" variant="secondary" onclick={handleEmailLogin}
					>Login with Email</Button
				>
				<!-- Optional: add sign-up later when local user creation is aligned -->
			</div>
		</div>

		<Button class="w-full" variant="secondary" onclick={checkAuthState}>
			📊 Check Auth State (Console)
		</Button>

		<Button class="w-full" variant="destructive" onclick={handleLogout}>🚪 Logout</Button>
	</div>

	<!-- Test Output -->
	{#if testOutput}
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
			<h3 class="mb-2 font-semibold text-blue-900">Test Output:</h3>
			<pre class="font-mono text-sm whitespace-pre-wrap text-blue-800">{testOutput}</pre>
		</div>
	{/if}

	<!-- Error Display -->
	{#if errorMessage}
		<div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
			{errorMessage}
		</div>
	{/if}
</div>
