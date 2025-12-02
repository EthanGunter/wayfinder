<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import { authAPI, cachedUsers as authUsers } from '$lib/API/Auth';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import { v4 } from 'uuid';
	import type { SessionUser, LoginCredentials, User } from '$domain/models/user';
	import { Err } from '$domain/errors';
	import * as Alert from '../ui/alert';
	import Icon from '@iconify/svelte';

	interface Props {
		onError?: (message: string, error?: Err) => void;
		onBack?: () => void;
		initialDisplayName?: string;
		initialEmail?: string;
		initialPassword?: string;
	}

	const {
		onError,
		onBack,
		initialEmail = '',
		initialPassword = '',
		initialDisplayName = ''
	}: Props = $props();

	let multipleAccounts = $state(false);
	let redir = page.url.searchParams.get('redirect') || '/planner';

	// Temporary user data for registration
	let tempUser = $state<SessionUser>({
		id: '',
		displayName: initialDisplayName,
		avatarUrl: '',
		createdAt: new Date(),
		status: 'active',
		features: [],
		sessionStatus: 'revoked' // TODO This may need to be active or expired...
	});

	let email = $state(initialEmail);
	let password = $state(initialPassword);
	let confirmPassword = $state('');
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

	function reportError(message: string, error?: Err) {
		if (onError) {
			onError(message, error);
		} else {
			errorMessage = message;
		}
	}

	async function handleRegister() {
		// Validation
		if (password !== confirmPassword) {
			reportError('Passwords do not match');
			return;
		}
		if (!tempUser.displayName?.trim()) {
			reportError('Display name is required');
			return;
		}
		isLoading = true;
		reportError('');
		try {
			const userData: SessionUser = {
				id: v4(),
				displayName: tempUser.displayName.trim(),
				avatarUrl: tempUser.avatarUrl || '',
				createdAt: new Date(),
				status: tempUser.status || 'active',
				features: [...(tempUser.features || [])],
				sessionStatus: 'revoked' // TODO This may need to be active or expired...
			};
			const creds: LoginCredentials = { type: 'email_password', email, password };
			const [reqs, reqError] = authAPI.getRegistrationRequirements(creds);
			if (reqError) {
				reportError('Invalid registration data');
				return;
			} else if (reqs.length > 0) {
				reportError('Invalid registration data: ' + reqs.map((r: any) => r.message).join(', '));
				return;
			}
			const [_, registerError] = await authAPI.register({ creds, userData });
			if (registerError) {
				// TODO:security This blindly trusts the error message from the backend.
				// Safe for alpha with trusted users, but should be sanitized for release.
				reportError(registerError.message || 'Registration failed', registerError);
			} else {
				goto(redir || '/planner');
			}
		} catch (error: any) {
			// TODO:security This blindly trusts the error message from the backend.
			reportError(error.message || 'An unexpected error occurred');
			Err.UNHANDLED(error, 'Registration error:');
		} finally {
			isLoading = false;
		}
	}

	function updateTempUser(updates: Partial<User>) {
		tempUser = { ...tempUser, ...updates };
	}
</script>

<div class="w-full max-w-md p-4 sm:p-6">
	<div class="mb-4 text-center">
		<h2 class="mb-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
			Create account
		</h2>
		<p class="text-sm text-zinc-500 dark:text-zinc-400">Get started with Wayfinder</p>
	</div>

	{#if errorMessage}
		<Alert.Root variant="destructive" class="mb-4">
			<Icon icon="lucide:alert-circle" />
			<Alert.Title>Uh oh!</Alert.Title>
			<Alert.Description>
				{errorMessage}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<form
		class="flex flex-col gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			handleRegister();
		}}
	>
		<div class="mb-1 flex justify-center py-2">
			<AvatarEditor
				class="h-24 w-24 sm:h-28 sm:w-28"
				user={tempUser}
				onAvatarChange={(avatarUrl: string) => updateTempUser({ avatarUrl: avatarUrl })}
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="displayName" class="text-sm font-medium text-zinc-700 dark:text-zinc-200"
				>Display Name</label
			>
			<input
				id="displayName"
				type="text"
				bind:value={tempUser.displayName}
				placeholder="Your name"
				required
				class="w-full rounded border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-base text-zinc-900 placeholder:opacity-60 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
			/>
		</div>

		<div class="flex flex-col gap-1.5">
			<label for="email" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Email</label>
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

		<div class="flex flex-col gap-1.5">
			<label for="confirmPassword" class="text-sm font-medium text-zinc-700 dark:text-zinc-200"
				>Confirm Password</label
			>
			<input
				id="confirmPassword"
				type="password"
				bind:value={confirmPassword}
				placeholder="••••••••"
				required
				class="w-full rounded border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-base text-zinc-900 placeholder:opacity-60 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
			/>
		</div>

		<div class="flex items-center justify-center gap-2 text-sm">
			<Button variant="link" onclick={onBack}>Login</Button>
			/
			<Button type="submit" variant="link" disabled={isLoading}>
				{isLoading ? 'Creating account...' : 'Create Account'}
			</Button>
		</div>
	</form>
</div>
