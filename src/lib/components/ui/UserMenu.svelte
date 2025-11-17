<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import Icon from '@iconify/svelte';
	import type { User } from '$domain/models/user';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { authState } from '$lib/API/Auth';
	import type { Snippet } from 'svelte';

	type Props = {
		user?: User;
		onItemClick?: (item: string) => void;
		children: Snippet;
	};

	const { user: _user, children, onItemClick }: Props = $props();

	let user = $derived(_user ?? ($authState.status === 'signed-in' ? $authState.user : undefined));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="h-full">
		<Button variant="ghost" class="h-9 px-2 py-0 hover:bg-accent hover:text-accent-foreground">
			<UserAvatar {user} />
			<Icon icon="lucide:chevron-down" class="ml-1 h-3 w-3" />
			<span class="sr-only">User menu</span>
		</Button>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label>
			<div class="flex flex-col space-y-1">
				<p class="text-sm leading-none font-medium">
					<span id="user-name">{user?.displayName}</span>
				</p>
			</div>
		</DropdownMenu.Label>

		<DropdownMenu.Separator />

		{@render children()}
		
	</DropdownMenu.Content>
</DropdownMenu.Root>
