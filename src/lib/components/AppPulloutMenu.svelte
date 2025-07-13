<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import supabase from '$lib/API/SupabaseClient';
	import BugReportModal from './BugReportModal.svelte';
	import PulloutBlock from './overlays/Pullout.svelte';

	let showPullout = $state(false);

	async function deleteAllTasks() {
		await supabase.from('tasks').delete();
		showPullout = false;
	}
</script>

<button onclick={() => (showPullout = true)} aria-label="Open menu">☰ menu</button>

<PulloutBlock bind:open={showPullout} placement="left">
	<h1>Settings</h1>
	<BugReportModal onSubmit={() => (showPullout = false)}>Submit a bug</BugReportModal>
	{#if DEVELOPMENT}
		<h2>Development Only</h2>
		<button onclick={deleteAllTasks}>Delete all tasks</button>
	{/if}
</PulloutBlock>
