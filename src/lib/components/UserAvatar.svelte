<script lang="ts">
	import { authState } from '$lib/API/Auth';
	import * as Avatar from '$lib/components/ui/avatar';

	interface Props {
		class?: string;
	}
	let { class: className }: Props = $props();

	function getFallbackName(displayName: string): string {
		const split = displayName.split(' ');
		if (split.length > 1) {
			return split[0][0] + split[1][0];
		} else {
			return displayName.substring(0, 2);
		}
	}
</script>

{#if $authState.status === 'signed-in'}
	{@const fallbackName = getFallbackName($authState.user.displayName)}
	<Avatar.Root class="size-8 rounded-lg {className}">
		<Avatar.Image src={$authState.user.avatarUrl} alt={$authState.user.displayName} />
		<Avatar.Fallback class="rounded-lg">{fallbackName}</Avatar.Fallback>
	</Avatar.Root>
{/if}