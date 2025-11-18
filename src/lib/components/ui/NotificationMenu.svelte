<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Icon from '@iconify/svelte';

	type Props = {
		notificationCount?: number;
		onItemClick?: (item: string) => void;
	};

	const { notificationCount = 3, onItemClick }: Props = $props();

	function click(item: string) {
		onItemClick?.(item);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		<Button variant="ghost" size="icon" class="relative h-9 w-9" aria-label="Notifications">
			<Icon icon="lucide:bell" class="h-4 w-4" />

			{#if notificationCount > 0}
				<Badge
					class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
				>
					{notificationCount > 9 ? '9+' : notificationCount}
				</Badge>
			{/if}

			<span class="sr-only">Notifications</span>
		</Button>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-80">
		<DropdownMenu.Label>Notifications</DropdownMenu.Label>
		<DropdownMenu.Separator />

		<DropdownMenu.Item onselect={() => click('notification1')}>
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium">
					<span id="notif-1-title">New message received</span>
				</p>
				<p class="text-xs text-muted-foreground">
					<span id="notif-1-meta">2 minutes ago</span>
				</p>
			</div>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => click('notification2')}>
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium">
					<span id="notif-2-title">System update available</span>
				</p>
				<p class="text-xs text-muted-foreground">
					<span id="notif-2-meta">1 hour ago</span>
				</p>
			</div>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => click('notification3')}>
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium">
					<span id="notif-3-title">Weekly report ready</span>
				</p>
				<p class="text-xs text-muted-foreground">
					<span id="notif-3-meta">3 hours ago</span>
				</p>
			</div>
		</DropdownMenu.Item>

		<DropdownMenu.Separator />

		<DropdownMenu.Item onselect={() => click('view-all')}>
			<span id="view-all">View all notifications</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
