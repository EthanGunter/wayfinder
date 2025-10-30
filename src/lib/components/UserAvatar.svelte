<script lang="ts">
	import type { SessionUser } from '$domain/models/user';

	interface Props {
		avatarUrl?: string;
		displayName?: string;
		class?: string;
	}
	let { avatarUrl, displayName, class: className }: Props = $props();
</script>

<div class="relative aspect-square overflow-hidden rounded-full bg-gray-100 {className}">
	{#if avatarUrl}
		<img src={avatarUrl} alt="User avatar" class="h-full w-full object-cover" />
	{:else}
		<div
			class="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-600 object-cover text-[200%] font-bold text-white"
		>
			{displayName?.charAt(0)?.toUpperCase() || '?'}
		</div>
	{/if}
</div>
