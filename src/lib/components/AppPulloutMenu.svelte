<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { getUser } from '$lib/API/Auth';
	import supabase from '$lib/API/SupabaseClient';
	import BugReportModal from './BugReportModal.svelte';
	import PulloutBlock from './overlays/Pullout.svelte';

	let showPullout = $state(false);

	async function deleteAllTasks() {
		const user = await getUser();
		if(!user) throw new Error(`No user could be found to delete all tasks...`);
		await supabase.from('tasks').delete().eq('user_id', user.id); // basically WHERE true
		showPullout = false;
		window.location.reload();
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
