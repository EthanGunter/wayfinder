<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, type User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import { authAPIPromise } from '$lib/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';

	let auth = $state<ILocalAuth>();
	let user = $state<User>();
	let multipleUsers = $state(false);

	onMount(async () => {
		auth = await authAPIPromise;
		user = (await auth.getActiveUser()) ?? undefined;
		multipleUsers = (await auth.listUsers()).length > 1;
	});
</script>

{#if auth && user}
	<div class="flex items-center gap-5">
		<h1>Account:</h1>
		<h4>{user.display_name}</h4>
	</div>
	{#if isAnonymous(user!)}
		<Button onclick={() => goto(`/register?redirect=${page.url.pathname + page.url.search}`)}>
			Customize Account
		</Button>
	{:else}
		<Button onclick={() => goto(`/account?redirect=${page.url.pathname + page.url.search}`)}>
			User Settings
		</Button>

		<Button
			onclick={() => {
				goto(`/login?redirect=${page.url.pathname + page.url.search}`);
			}}
		>
			Switch User
		</Button>
	{/if}
	{#if !isAnonymous(user)}
		<!-- If not anonymous account -->
		<Button
			onclick={async () => {
				await auth!.logout();
				goto('/');
			}}
		>
			Sign out
		</Button>
	{/if}
{/if}
