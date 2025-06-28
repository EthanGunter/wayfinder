<script lang="ts">
	import { dev as DEVELOPMENT } from '$app/environment';
	import { goto } from '$app/navigation';
	import BugReportMenu from '$lib/components/BugReportMenu.svelte';
	import type { Task } from '$lib/DataAPI/Task';
	import SearchBar from './SearchBar.svelte';

	function openPulloutMenu() {
		// TODO: Implement pullout menu logic - will need to create a pullout menu component
		console.log('Opening pullout menu...');
	}

	function gotoTask(task: Task | string) {
		if (typeof task === 'string') {
			// Handle string search results
			goto(`/tasks/?search=${encodeURIComponent(task)}`);
		} else {
			// Handle Task objects
			goto(`/tasks/?id=${task.id}`);
		}
	}
</script>

<div class={'app-header'}>
	{#if DEVELOPMENT}
		<button onclick={openPulloutMenu} aria-label="Open menu">☰</button>
	{:else}
		<BugReportMenu />
	{/if}
	<SearchBar
		handleQuery={() => Promise.resolve([{ title: 'Fake', complete: false }, 'query', 'response'])}
		onItemSelected={gotoTask}
		defaultOptions={['what da frik']}
	></SearchBar>
</div>

<style lang="scss">
	.app-header {
		// Layout
		display: flex;
		align-items: center;
		justify-content: space-between;

		// Style
		gap: var(--gap-small);
		padding: 1rem;
		box-shadow: 0px 0px 20px 0px var(--c-shadow);
		color: var(--c-text_2);
		background-color: var(--c-bg_1);
	}

	:global(#app-header-menu) {
		height: 100vh;
		max-height: 100vh;
	}
</style>
