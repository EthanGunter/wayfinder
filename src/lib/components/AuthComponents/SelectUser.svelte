<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { authAPI, authState, cachedUsers, remoteAuth } from '$lib/API/Auth';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';
	import { Err, InputRequiredError } from '$domain/errors';

	// Fallback avatar images from 3rd-party (BetterAuth) only when first-party avatarUrl is missing
	let fallbackAvatars = $state<Map<string, string | undefined>>(new Map());

interface Props {
	onError?: (message: string, error?: Err) => void;
	onAddAccount?: () => void;
}

const { onError, onAddAccount: onAddUser }: Props = $props();

	let currentUser = $derived($authState.status === 'signed-in' ? $authState.user : null);
	let redir = page.url.searchParams.get('redirect') || '/';
	onMount(async () => {
		const [sessions, err] = await remoteAuth.getUserSessions();
		if (err) return;
		const map = new Map<string, string | undefined>();
		for (const s of sessions) {
			map.set(s.user.id, s.user.avatarUrl);
		}
		fallbackAvatars = map; // TODO This should be handled at the server-response level, rather than client-side
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
		{#each $cachedUsers as user (user.id)}
			<button
				onclick={() => handleUserSwitch(user.id)}
				disabled={$authState.status === 'loading'}
				class="flex w-full items-center gap-3 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 {currentUser?.id ===
				user.id
					? 'border-blue-500 bg-blue-50'
					: ''}"
			>
				<UserAvatar
					avatarUrl={user.avatarUrl ?? fallbackAvatars.get(user.id)}
					displayName={user.displayName}
					class="h-10 w-10"
				/>
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

		{#if onAddUser}
			<button
				onclick={onAddUser}
				disabled={$authState.status === 'loading'}
				class="mt-2 flex w-full items-center justify-between gap-3 rounded border border-dashed border-gray-300 bg-white p-3 text-left text-gray-700 transition-colors hover:bg-gray-50 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,122,204,0.2)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
			>
				<span class="flex items-center gap-3">
					<Icon icon="mdi:plus" class="text-gray-500" />
					<span>Use another account</span>
				</span>
				<Icon icon="mdi:chevron-right" class="text-gray-400" />
			</button>
		{/if}
	</div>
</div>
