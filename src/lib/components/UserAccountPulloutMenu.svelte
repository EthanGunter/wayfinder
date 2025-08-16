<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, type LocalUser } from '$lib/API/Auth/User';
	import type { IAuthAPI, ILocalAuth } from '$lib/API/Auth/types';
	import UserAvatar from './UserAvatar.svelte';
	import { Button } from './ui/button';
	import * as Sheet from './ui/sheet';
	interface Props {
		user: LocalUser;
		authAPI: ILocalAuth;
	}
	const { user, authAPI }: Props = $props();

	let multipleUsers = $state(false);

	$effect(() => {
		authAPI.listUsers().then((users) => {
			multipleUsers = users.length > 1;
		});
	});
</script>

{#if user}
	<Sheet.Root>
		<Sheet.Trigger>
			<div id="account-menu-btn" class="flex h-12 w-12 overflow-hidden rounded-full p-0">
				<UserAvatar {user} />
			</div>
		</Sheet.Trigger>
		<Sheet.Content>
			<h1>Account</h1>
			<h4>{user.display_name}</h4>
			{#if isAnonymous(user)}
				<Button
					onclick={() => goto(`/login?register&redirect=${page.url.pathname + page.url.search}`)}
				>
					Customize Account
				</Button>
			{:else}
				<Button onclick={() => goto(`/account?redirect=${page.url.pathname + page.url.search}`)}>
					User Settings
				</Button>
			{/if}
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
						authAPI.logout();
					}}
				>
					Sign out
				</Button>
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{/if}
