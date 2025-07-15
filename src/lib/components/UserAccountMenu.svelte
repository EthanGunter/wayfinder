<script lang="ts">
	import { goto } from '$app/navigation';
	import type { LocalUserProxy } from '$lib/API/Auth/types';
	interface Props {
		user: LocalUserProxy;
	}
	const { user }: Props = $props();
</script>

{#if user}
	<button id="user-account-menu" onclick={() => goto('/account')}>
		{user.displayName == '' ? '🙈' : '😁'}
	</button>
{/if}

<style lang="scss">
	#user-account-menu {
		font-size: x-large;
	}
</style>
