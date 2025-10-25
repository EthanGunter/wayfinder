<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { authAPI, authState } from '$lib/API/Auth';

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

	async function testUpdateUser() {
		testOutput = 'Updating user displayName...';
		try {
			const result = await authAPI.updateUser({
				update: { displayName: 'Test User ' + Date.now() }
			});
			if (result[0]) {
				testOutput = `✓ User updated: ${JSON.stringify(result[0], null, 2)}`;
			} else {
				testOutput = `✗ Update error: ${result[1]?.message}`;
			}
		} catch (e: any) {
			testOutput = `✗ Update exception: ${e.message}`;
		}
	}

	console.log('[Login page] Auth state:', $authState.status);
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

		<Button class="w-full" variant="secondary" onclick={checkAuthState}>
			📊 Check Auth State (Console)
		</Button>

		<Button class="w-full" variant="secondary" onclick={testUpdateUser}>
			✏️ Update User DisplayName
		</Button>

		<Button class="w-full" variant="destructive" onclick={handleLogout}>🚪 Logout</Button>

		<Button class="w-full" variant="link" onclick={() => goto(`/register?redirect=${redir}`)}>
			📝 Go to Register Page
		</Button>
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
