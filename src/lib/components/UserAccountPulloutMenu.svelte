<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StoredUser } from '$lib/API/Auth/types';
	import Pullout from './overlays/Pullout.svelte';
	interface Props {
		user: StoredUser;
	}
	const { user }: Props = $props();
	let menuOpen = $state(false);
</script>

{#if user}
	<button id="account-menu-btn" onclick={() => (menuOpen = true)}>
		{user.display_name ? '😁' : '🙈'}
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
				<button>Sign out</button>
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
	#account-menu-btn {
		font-size: x-large;
	}
	#account-menu-pullout {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
