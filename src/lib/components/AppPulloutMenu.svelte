<script lang="ts">
	import BugReportModal from './BugReportModal.svelte';
	import Pullout from './overlays/Pullout.svelte';

	let showPullout = $state(false);
</script>

<button onclick={() => (showPullout = true)} aria-label="Open menu">☰ menu</button>

<Pullout bind:open={showPullout} placement="left">
	<h1>Settings</h1>
	<BugReportModal onSubmit={() => (showPullout = false)}>Submit a bug</BugReportModal>
</Pullout>
