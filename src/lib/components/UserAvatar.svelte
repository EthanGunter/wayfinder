<script lang="ts">
	import type { LocalUser } from '$domain/models/user';

	interface Props {
		user: LocalUser;
		class?: string;
	}
	let { user, class: className }: Props = $props();
</script>

<div class="relative aspect-square overflow-hidden rounded-full bg-gray-100 {className}">
	{#if user.avatarUrl}
		<img src={user.avatarUrl} alt="User avatar" class="h-full w-full object-cover" />
	{:else}
		<div
			class="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-600 object-cover text-[200%] font-bold text-white"
		>
			{user.displayName?.charAt(0)?.toUpperCase() || '?'}
		</div>
	{/if}
</div>
