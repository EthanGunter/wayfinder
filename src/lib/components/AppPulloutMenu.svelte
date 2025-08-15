<script lang="ts">
	import BugReportModal from './BugReportModal.svelte';
	import { Button } from './ui/button';
	import * as Sheet from './ui/sheet';

	let showSheet = $state(false);
</script>

<Sheet.Root bind:open={showSheet}>
	<Sheet.Trigger>
		<Button onclick={() => (showSheet = true)} aria-label="Open menu">☰ menu</Button>
	</Sheet.Trigger>
	<Sheet.Content side="left">
		<h1>Settings</h1>
		<BugReportModal onSubmit={() => (showSheet = false)}>Submit a bug</BugReportModal>
	</Sheet.Content>
</Sheet.Root>
