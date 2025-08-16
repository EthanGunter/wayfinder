<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, type User } from '$lib/API/Auth/User';
	import UserAvatar from './UserAvatar.svelte';
	import { Button } from './ui/button';
	import * as Sheet from './ui/sheet';
	import { authAPIPromise } from '$lib/stores/services';
	import { onMount } from 'svelte';
	import { redirect } from '@sveltejs/kit';
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
	<h1>Account</h1>
	<h4>{user.display_name}</h4>
	<Button
		onclick={() =>
			isAnonymous(user!)
				? goto(`/login?register&redirect=${page.url.pathname + page.url.search}`)
				: goto(`/account?redirect=${page.url.pathname + page.url.search}`)}
	>
		User Settings
	</Button>
	{#if multipleUsers}
		<!-- TODO if there are multiple local accounts -->
		<Button
			onclick={() => {
				throw new Error('NotImplemented');
			}}
		>
			Switch User
		</Button>
	{/if}
	{#if !isAnonymous(user)}
		<!-- If not anonymous account -->
		<Button
			onclick={() => {
				auth!.logout();
			}}
		>
			Sign out
		</Button>
	{/if}
{/if}
