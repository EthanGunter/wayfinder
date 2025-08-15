<script lang="ts">
	import type { LocalUser } from '@/API/Auth/User';

	interface Props {
		user: LocalUser;
	}
	const { user }: Props = $props();
</script>

<div class="relative rounded-full overflow-hidden bg-gray-100 aspect-square">
	{#if user.avatar_url}
		<img src={user.avatar_url} alt="User avatar" class="w-full h-full object-cover" />
	{:else}
		<div class="w-full h-full object-cover flex items-center justify-center text-[200%] font-bold bg-gradient-to-br from-blue-400 to-purple-600 text-white">
			{user.display_name?.charAt(0)?.toUpperCase() || '?'}
		</div>
	{/if}
</div>
