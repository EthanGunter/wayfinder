<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, userHasFeature, type LocalUser } from '$lib/API/Auth/User';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import UserAvatar from './UserAvatar.svelte';
	import Pullout from './overlays/Pullout.svelte';
	import { Button } from './ui/button';
	import * as Sheet from './ui/sheet';
	interface Props {
		user: LocalUser;
		authAPI: IAuthAPI;
	}
	const { user, authAPI }: Props = $props();
</script>

{#if user}
	<Sheet.Root>
		<Sheet.Trigger>
			<div id="account-menu-btn">
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
					Account Settings
				</Button>
			{:else}
				<Button onclick={() => goto(`/account?redirect=${page.url.pathname + page.url.search}`)}>
					User Settings
				</Button>
			{/if}
			{#if false}
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

<style lang="scss">
	.user-avatar {
		width: 1rem;
		height: 1rem;
	}
	#account-menu-btn {
		display: flex;
		border-radius: 50%;
		overflow: hidden;
		width: 3rem;
		height: 3rem;
		padding: unset;

		& > * {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
	}
	#account-menu-pullout {
		min-width: 15rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
