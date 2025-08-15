<script lang="ts">
	import BugReportModal from './BugReportModal.svelte';
	import Pullout from './overlays/Pullout.svelte';
	import { Button } from './ui/button';

	let showPullout = $state(false);
</script>

<Button onclick={() => (showPullout = true)} aria-label="Open menu">☰ menu</Button>

<Pullout bind:open={showPullout} placement="left">
	<h1>Settings</h1>
	<BugReportModal onSubmit={() => (showPullout = false)}>Submit a bug</BugReportModal>
</Pullout>
