<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import BugReportModal from './BugReportModal.svelte';
	import PulloutBlock from './overlays/Pullout.svelte';

	let showPullout = $state(false);
</script>

<button onclick={() => (showPullout = true)} aria-label="Open menu">☰</button>

<PulloutBlock bind:open={showPullout} placement="left">
	<h1>Settings</h1>
	<BugReportModal onSubmit={() => (showPullout = false)}>Submit a bug</BugReportModal>
	{#if DEVELOPMENT}
		<h2>Development Only</h2>
	{/if}
</PulloutBlock>
