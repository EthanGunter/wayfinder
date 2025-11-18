<script lang="ts">
	import type { User } from '$domain/models/user';
	import { authState } from '$lib/API/Auth';
	import * as Avatar from '$lib/components/ui/avatar';

	interface Props {
		user?: User;
		class?: string;
	}
	let { class: className, user }: Props = $props();

	let _user = $derived(user ?? ($authState.status === 'signed-in' ? $authState.user : undefined));

	function getFallbackName(displayName: string): string {
		const split = displayName.split(' ');
		if (split.length > 1) {
			return split[0][0] + split[1][0];
		} else {
			return displayName.substring(0, 2);
		}
	}
</script>

{#if _user}
	{@const fallbackName = getFallbackName(_user.displayName)}
	<Avatar.Root class="size-8 rounded-lg {className}">
		<Avatar.Image src={_user.avatarUrl} alt={_user.displayName} />
		<Avatar.Fallback class="rounded-lg">{fallbackName}</Avatar.Fallback>
	</Avatar.Root>
{:else}
	<Avatar.Root class="size-8 rounded-lg {className}">
		<Avatar.Fallback class="rounded-lg">?</Avatar.Fallback>
	</Avatar.Root>
{/if}
