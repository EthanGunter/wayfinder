<!-- src/routes/reset-password/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { authAPI } from '$lib/API/Auth';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Alert from '$lib/components/ui/alert';
	import Icon from '@iconify/svelte';
	import type { PageData } from './$types';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';

	let data: PageData = $props();

	const token = page.url.searchParams.get('token') ?? '';

	let password = $state('');
	let confirmPassword = $state('');
	let error: string | null = $state(null);
	let loading = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;

		if (!token) {
			error = 'Missing reset token. Try requesting a new reset link.';
			return;
		}

		if (!password || password.length < 8) {
			error = 'Password must be at least 8 characters.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;
		const [data, resetError] = await authAPI.resetPassword(token, password);

		if (resetError) {
			error = resetError.message;
			loading = false;
			return;
		} else {
			toast.success('Password successfully changed!');
			goto('/');
		}

		// Optionally redirect after a short delay
		// await new Promise((r) => setTimeout(r, 1500));
		// await goto("/login");

		loading = false;
	}
</script>

<svelte:head>
	<title>Reset your password</title>
</svelte:head>
<div class="page flex min-h-screen min-w-screen items-center justify-center p-4">
	<div
		class="relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-4 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"
	>
		<div class="flex items-center justify-center">
			<div class="w-full max-w-md p-4 sm:p-6">
				<div class="mb-4 text-center">
					<h2 class="mb-1 text-2xl font-semibold text-zinc-900 sm:text-3xl dark:text-zinc-100">
						Reset your password
					</h2>
					<p class="text-sm text-zinc-500 dark:text-zinc-400">Enter your new password below</p>
				</div>

				{#if error}
					<Alert.Root variant="destructive" class="mb-4">
						<Icon icon="lucide:alert-circle" />
						<Alert.Title>Uh oh!</Alert.Title>
						<Alert.Description>
							{error}
						</Alert.Description>
					</Alert.Root>
				{/if}

				<form class="flex flex-col gap-2" on:submit|preventDefault={handleSubmit}>
					<input type="hidden" value={token} />

					<div class="flex flex-col gap-1.5">
						<label for="password" class="text-sm font-medium text-zinc-700 dark:text-zinc-200"
							>New password</label
						>
						<Input
							id="password"
							type="password"
							bind:value={password}
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<label
							for="confirmPassword"
							class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Confirm password</label
						>
						<Input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							placeholder="••••••••"
							autocomplete="new-password"
							required
						/>
					</div>

					<div class="flex items-center justify-center gap-2 text-sm">
						<Button type="submit" variant="link" disabled={loading}>
							{loading ? 'Resetting...' : 'Reset password'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
