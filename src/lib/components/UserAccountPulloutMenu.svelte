<script lang="ts">
	import { goto } from '$app/navigation';
	import type { IAuthAPI, LocalUser } from '$lib/API/Auth/types';
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
			<button onclick={() => goto('/account')}> Customize User </button>
			{#if true}
				<!-- TODO if there's no other local account  -->
				<button
					onclick={() => {
						throw new Error('NotImplemented');
					}}
				>
					Add User
				</button>
			{:else}
				<button
					onclick={() => {
						throw new Error('NotImplemented');
					}}
				>
					Switch User
				</button>
			{/if}
			{#if user.display_name}
				<!-- If not anonymous account -->
				<button
					onclick={() => {
						authAPI.logout();
					}}
				>
					Sign out
				</button>
			{/if}
			{#if !user.is_synced}
				<button
					onclick={() => {
						goto('/account/upgrade');
					}}
				>
					Sync
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
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
