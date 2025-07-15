<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import { invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { getUser } from '$lib/API/Auth';
	import supabase from '$lib/API/SupabaseClient';
	import { devStore } from '$lib/stores/devStore.svelte';
	import BugReportModal from './BugReportModal.svelte';
	import PulloutBlock from './overlays/Pullout.svelte';

	let showPullout = $state(false);

	async function deleteAllTasks() {
		const user = await getUser();
		if (!user) throw new Error(`No user could be found to delete all tasks...`);
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
		<div id="devmode-block">
			<h2>
				<label for="dev-mode"> Development Mode </label>
				<input id="dev-mode" type="checkbox" bind:checked={devStore.devMode} />
			</h2>
			{#if devStore.devMode}
				<label for="task-provider-override">Task API Override</label>
				<select
					id="task-provider-override"
					value={devStore.taskProviderOverride}
					oninput={(evt) => {
						devStore.taskProviderOverride = evt.currentTarget.value as any;
						invalidateAll();
					}}
				>
					<option value="none">Default</option>
					<option value="supabase">Supabase</option>
					<option value="browser">Browser</option>
					<option value="native">Native</option>
				</select>
				<button class="alert" onclick={deleteAllTasks}>Delete all tasks</button>
			{/if}
		</div>
	{/if}
</PulloutBlock>

<style lang="scss">
	#devmode-block {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
