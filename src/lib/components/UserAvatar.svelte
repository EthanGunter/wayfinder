<script lang="ts">
	import type { LocalUser } from '@/API/Auth/User';

	interface Props {
		user: LocalUser;
		class?: string;
	}
	const { user, class: className }: Props = $props();
</script>

<div class="relative aspect-square overflow-hidden rounded-full bg-gray-100 {className}">
	{#if user.avatar_url}
		<img src={user.avatar_url} alt="User avatar" class="h-full w-full object-cover" />
	{:else}
		<div
			class="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-600 object-cover text-[200%] font-bold text-white"
		>
			{user.display_name?.charAt(0)?.toUpperCase() || '?'}
		</div>
	{/if}
</div>
