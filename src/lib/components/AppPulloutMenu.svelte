<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { LocalUser } from '$lib/API/Auth/types';
	import { TASK_TABLE_NAME } from '$lib/API/localDB';
	import supabase from '$lib/API/SupabaseClient';
	import provider from '$lib/API/Tasks/BrowserTaskProvider';
	import { devStore } from '$lib/stores/devStore.svelte';
	import BugReportModal from './BugReportModal.svelte';
	import Pullout from './overlays/Pullout.svelte';

	interface Props {
		user: LocalUser;
	}
	const { user }: Props = $props();

	let showPullout = $state(false);
</script>

<button onclick={() => (showPullout = true)} aria-label="Open menu">☰ menu</button>

<Pullout bind:open={showPullout} placement="left">
	<h1>Settings</h1>
	<BugReportModal onSubmit={() => (showPullout = false)}>Submit a bug</BugReportModal>
	{#if DEVELOPMENT}
		<div id="devmode-block">
			<h2>
				<label for="dev-mode"> Development Mode </label>
				<input id="dev-mode" type="checkbox" bind:checked={devStore.devMode} />
			</h2>
			<span>
				<button onclick={async () => (await provider.get())[0].exportData({})}> Export Data </button>
			</span>
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
					<!-- <option value="browser">Browser</option> -->
					<option value="native">Native</option>
				</select>
				<button
					class="alert"
					onclick={async () => {
						if (!user) throw new Error(`No user could be found to delete all tasks...`);
						await supabase.from(TASK_TABLE_NAME).delete().eq('user_id', user.id); // basically WHERE true
						showPullout = false;
						window.location.reload();
					}}>Delete all tasks from Supabase</button
				>
			{/if}
		</div>
	{/if}
</Pullout>

<style lang="scss">
	#devmode-block {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
