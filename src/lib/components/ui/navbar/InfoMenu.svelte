<script lang="ts">
	// Adjust imports to your shadcn-svelte dropdown menu paths
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';

	type Props = {
		onItemClick?: (item: string) => void;
	};

	const { onItemClick }: Props = $props();

	function click(item: string) {
		onItemClick?.(item);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		<Button variant="ghost" size="icon" class="h-9 w-9">
			<Icon icon="lucide:help-circle" class="h-4 w-4" />
			<span class="sr-only">Help and Information</span>
		</Button>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label>Help &amp; Support</DropdownMenu.Label>
		<DropdownMenu.Separator />

		<DropdownMenu.Item onselect={() => click('help')}>
			<span id="item-help">Help Center</span>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => click('documentation')}>
			<span id="item-documentation">Documentation</span>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => click('contact')}>
			<span id="item-contact">Contact Support</span>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => click('feedback')}>
			<span id="item-feedback">Send Feedback</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
