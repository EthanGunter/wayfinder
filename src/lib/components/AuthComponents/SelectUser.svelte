<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { onMount } from 'svelte';
	import {
		authAPI,
		authState,
		cachedUsers as authUsers,
		cachedUsers,
		remoteAuth
	} from '$lib/API/Auth';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';
	import { Err, InputRequiredError, NotImplementedError } from '$domain/errors';

	type DeviceSessionDTO = {
		session: { token: string; userId: string };
		user: { id: string; displayName: string; avatarUrl?: string };
	};

	interface Props {
		onError?: (message: string, error?: Err) => void;
	}

	const { onError }: Props = $props();

	let currentUser = $derived($authState.status === 'signed-in' ? $authState.user : null);
	let redir = page.url.searchParams.get('redirect') || '/';
	let deviceSessions = $state<DeviceSessionDTO[] | null>(null);

	onMount(async () => {
		const [sessions, err] = await remoteAuth.getUserSessions();
		if (err) return;
		if (sessions.length === 0 && $cachedUsers.length === 0) {
			// goto('/login');
			return;
		}
		deviceSessions = sessions;
	});

	async function handleUserSwitch(userId: string) {
		try {
			const [newUser, error] = await authAPI.switchUser(userId);
			console.log(newUser, error);

			if (newUser) {
				// Switch successful, redirect
				goto(redir);
            } else if (error instanceof InputRequiredError) {
                // Require login for this account: surface error and immediately initiate external auth
                const u = $cachedUsers.find((u) => u.id === userId);
                const message = u
                    ? `Please sign in to continue as ${u.displayName}`
                    : 'Login required to access this account.';
                onError?.(message, error);
                // Kick off external login; if it fails, the user stays on this view with the error bubble
                try {
                    await authAPI.login({ type: 'external' });
                } catch (e) {
                    // noop: error bubble remains visible
                }
			} else {
				Err.UNHANDLED(error);
			}
		} catch (error) {
			onError?.('An unexpected error occurred');
			console.error('User switch error:', error);
		}
	}
</script>

<div class="mb-4">
	<div class="space-y-2">
		{#if deviceSessions && deviceSessions.length > 0}
			{#each deviceSessions as s (s.session.token)}
				<button
					onclick={() => handleUserSwitch(s.user.id)}
					disabled={$authState.status === 'loading'}
					class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id ===
					s.user.id
						? 'border-blue-500 bg-blue-50'
						: ''}"
				>
					<UserAvatar
						user={{
							id: s.user.id,
							displayName: s.user.displayName,
							avatarUrl: s.user.avatarUrl,
							createdAt: new Date(),
							status: 'active',
							features: []
						}}
						class="h-10 w-10"
					/>
					<div class="flex-1">
						<div class="font-medium text-gray-900">
							{s.user.displayName}
						</div>
						{#if currentUser?.id === s.user.id}
							<div class="text-xs text-blue-600">Currently active</div>
						{/if}
					</div>
					<Icon icon="mdi:chevron-right" class="text-gray-400" />
				</button>
			{/each}
		{:else}
			{#each $cachedUsers as user (user.id)}
				<button
					onclick={() => handleUserSwitch(user.id)}
					disabled={$authState.status === 'loading'}
					class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id ===
					user.id
						? 'border-blue-500 bg-blue-50'
						: ''}"
				>
					<UserAvatar {user} class="h-10 w-10" />
					<div class="flex-1">
						<div class="font-medium text-gray-900">
							{user.displayName}
						</div>
						{#if currentUser?.id === user.id}
							<div class="text-xs text-blue-600">Currently active</div>
						{/if}
					</div>
					{#if $authState.status === 'loading'}
						<Icon icon="mdi:loading" class="animate-spin text-gray-400" />
					{:else}
						<Icon icon="mdi:chevron-right" class="text-gray-400" />
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>
