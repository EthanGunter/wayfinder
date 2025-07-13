<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<button id="user-account-menu" onclick={() => goto('/account')}>😁</button>

<style lang="scss">
	#user-account-menu {
		font-size: x-large;
	}
</style>
