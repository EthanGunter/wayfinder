<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StoredUser } from '$lib/API/Auth/types';
	interface Props {
		user: StoredUser;
	}
	const { user }: Props = $props();
</script>

{#if user}
	<button id="user-account-menu" onclick={() => goto('/account')}>
		{user.display_name == '' ? '🙈' : '😁'}
	</button>
{/if}

<style lang="scss">
	#user-account-menu {
		font-size: x-large;
	}
</style>
