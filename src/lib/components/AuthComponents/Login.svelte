<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPI, cachedUsers as authUsers } from '$lib/API/Auth';
	import type { Err } from '$domain/errors';
	import Register from './Register.svelte';
	import Icon from '@iconify/svelte';
	import ForgotPasswordDialogContent from './ResetPasswordButton.svelte';
	import { Dialog } from 'bits-ui';
	import ResetPasswordButton from './ResetPasswordButton.svelte';
	import * as Alert from '../ui/alert';

	interface Props {}

	const {}: Props = $props();

	let multipleAccounts = $state(false);
	let showRegister = $state(false);
	let redir = page.url.searchParams.get('redirect') || '/planner';

	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isLoading = $state(false);

	onMount(() => {
		const unsubscribeUsers = authUsers.subscribe((userList) => {
			multipleAccounts = userList.length > 1;
		});
		return () => unsubscribeUsers();
	});

	async function handleOAuthLogin() {
		isLoading = true;
		errorMessage = '';
		try {
			const [_, error] = await authAPI.login({ type: 'external' });
			if (error) {
				errorMessage = error.messageForUser || 'Login failed';
			}
			// OAuth flow will handle redirect via provider/callback
		} catch (e: any) {
			errorMessage = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}

	async function handleEmailLogin() {
		if (!email || !password) {
			errorMessage = 'Email and password are required';
			return;
		}
		isLoading = true;
		errorMessage = '';
		try {
			const [_, error] = await authAPI.login({ type: 'email_password', email, password });
			if (error) {
				errorMessage = error.messageForUser || 'Login failed';
				return;
			}
			goto(redir || '/planner');
		} catch (e: any) {
			errorMessage = 'An unexpected error occurred';
		} finally {
			isLoading = false;
		}
	}

	function openRegister() {
		showRegister = true;
	}

	function closeRegister() {
		showRegister = false;
	}
</script>

{#if errorMessage}
	<Alert.Root variant="destructive">
		<Icon icon="lucide:alert-circle" />
		<Alert.Title>Uh oh!</Alert.Title>
		<Alert.Description>
			{errorMessage}
		</Alert.Description>
	</Alert.Root>
{/if}

<div class="flex items-center justify-center">
	{#if showRegister}
		<div class="w-full max-w-md">
			<button
				onclick={closeRegister}
				class="group mb-3 inline-flex items-center gap-2 rounded px-3 py-2 text-sm text-zinc-600 transition-all duration-200 hover:-translate-x-0.5 hover:text-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-100"
			>
				<span class="text-xl transition-transform duration-200 group-hover:-translate-x-1">←</span>
				<span>Back to login</span>
			</button>
			<Register
				onBack={closeRegister}
				initialDisplayName={email.split('@')[0]}
				initialEmail={email}
				initialPassword={password}
			/>
		</div>
	{:else}
		<div class="w-full max-w-md p-4 sm:p-6">
			<div class="mb-4 text-center">
				<h2 class="mb-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
					Welcome back
				</h2>
				<p class="text-sm text-zinc-500 dark:text-zinc-400">Sign in to continue</p>
			</div>

			<!-- TODO:TEMP social auth disabled until we figure out why Vercel blocks it... -->
			<!-- <div class="mb-4">
				<Button
					class="w-full gap-2 px-3 py-3 font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
					variant="secondary"
					onclick={handleOAuthLogin}
					disabled={isLoading}
				>
					<Icon icon="lucide:github" class="text-lg" />
					<span>Continue with GitHub</span>
				</Button>
			</div>

			<div class="my-4 flex items-center gap-3">
				<span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
				<span
					class="text-xs font-medium tracking-wide whitespace-nowrap text-zinc-500 uppercase dark:text-zinc-400"
					>or</span
				>
				<span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-700"></span>
			</div> -->

			<form
				class="flex flex-col gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					handleEmailLogin();
				}}
			>
				<div class="flex flex-col gap-1.5">
					<label for="email" class="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>Email</label
					>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder="you@example.com"
						required
						class="w-full rounded border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-base text-zinc-900 placeholder:opacity-60 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="password" class="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>Password</label
					>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						required
						class="w-full rounded border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-base text-zinc-900 placeholder:opacity-60 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
					/>
				</div>
				<div class="flex items-center justify-center gap-2 text-sm">
					<Button variant="link" onclick={openRegister}>Register</Button>
					/
					<Button type="submit" variant="link" disabled={isLoading}>
						{isLoading ? 'Signing in...' : 'Sign in'}
					</Button>
				</div>
				<ResetPasswordButton />
			</form>
		</div>
	{/if}
</div>
