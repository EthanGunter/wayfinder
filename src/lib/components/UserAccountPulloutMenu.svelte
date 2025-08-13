<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, userHasFeature, type LocalUser } from '$lib/API/Auth/User';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import UserAvatar from './UserAvatar.svelte';
	import Pullout from './overlays/Pullout.svelte';
	interface Props {
		user: LocalUser;
		authAPI: IAuthAPI;
	}
	const { user, authAPI }: Props = $props();
	let menuOpen = $state(false);
</script>

{#if user}
	<button id="account-menu-btn" onclick={() => (menuOpen = true)}>
		<UserAvatar {user} />
	</button>
	<Pullout bind:open={menuOpen} placement="right">
		<div id="account-menu-pullout">
			<h1>Account</h1>
			<h4>{user.display_name}</h4>
			{#if isAnonymous(user)}
				<button
					onclick={() => goto(`/login?register&redirectTo=${page.url.pathname + page.url.search}`)}
				>
					Create Account
				</button>
			{:else}
				<button onclick={() => goto('/account')}> User Settings </button>
			{/if}
			{#if false}
				<!-- TODO if there are multiple local accounts -->
				<button
					onclick={() => {
						throw new Error('NotImplemented');
					}}
				>
					Switch User
				</button>
			{/if}
			{#if !isAnonymous(user)}
				<!-- If not anonymous account -->
				<button
					onclick={() => {
						authAPI.logout();
					}}
				>
					Sign out
				</button>
			{/if}
		</div>
	</Pullout>
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
