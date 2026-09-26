<script lang="ts">
	// Adjust imports to your shadcn-svelte dropdown menu paths
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { replayOnboarding } from '$lib/tutorials';

	type Props = {
		onItemClick?: (item: string) => void;
		class?: string;
	};

	const FORMS = {
		bug: 'https://docs.google.com/forms/d/e/1FAIpQLSfG_C9I54vHhHgFM0xF2Je9fUgEGvmPDceNhSwOI_3oGU8SdA/viewform?usp=sf_link',
		feature:
			'https://docs.google.com/forms/d/e/1FAIpQLScP4Yz3kHHbCFVR4ogsTSB9_XJ_rVGPNuQcS71T4LsV0lSsmw/viewform?usp=sf_link',
		feedback:
			'https://docs.google.com/forms/d/e/1FAIpQLScGlOmqhskpYlWoU6pMYPVooJeEERG45gztSxkMO7dFVVLXvg/viewform?usp=sf_link'
	};

	const { onItemClick, class: className }: Props = $props();

	function click(item: string) {
		onItemClick?.(item);
	}

	function replayTutorial() {
		// Resets onboarding progress and flags it so it starts even if the user has projects
		replayOnboarding();
		goto('/projects');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class={className}>
		<Button id="btn-feedback" variant="ghost" size="icon">
			<Icon icon="material-symbols:feedback-outline" class="size-5" />
			<span class="sr-only">Help and Information</span>
		</Button>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label>Help &amp; Support</DropdownMenu.Label>

		<DropdownMenu.Separator />

		<DropdownMenu.Item onselect={() => window.open(FORMS.bug, '_blank')}>
			<Icon icon="lucide:bug" />
			<span id="item-documentation">Report a bug</span>
		</DropdownMenu.Item>

		<DropdownMenu.Item onselect={() => window.open(FORMS.feature, '_blank')}>
			<Icon icon="lucide:lightbulb" />
			<span id="item-help">Suggest a feature</span>
		</DropdownMenu.Item>

		<!-- <DropdownMenu.Item onselect={() => click('contact')}>
			<span id="item-contact">Documentation</span>
		</DropdownMenu.Item> -->

		<DropdownMenu.Item onselect={() => window.open(FORMS.feedback, '_blank')}>
			<Icon icon="lucide:message-circle" />
			<span id="item-feedback">Send Feedback</span>
		</DropdownMenu.Item>

		<DropdownMenu.Separator />

		<DropdownMenu.Item onselect={replayTutorial}>
			<Icon icon="lucide:graduation-cap" />
			<span id="item-replay-tutorial">Replay tutorial</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
