<script lang="ts">
	import { goto } from '$app/navigation';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import type { Task } from '$lib/API/Tasks/';
	import type { Snippet } from 'svelte';
	import AppPulloutMenu from './AppPulloutMenu.svelte';
	import UserAccountMenu from './UserAccountPulloutMenu.svelte';
	import type { LocalUser } from '$lib/API/Auth/User';

	interface Props {
		user: LocalUser;
		authAPI: IAuthAPI;
		left?: Snippet;
		right?: Snippet;
	}
	const { user, authAPI, left, right }: Props = $props();

	async function search(query: string): Promise<Task[]> {
		try {
			// TODO: Use ITaskStorage API
			// const results = await searchTasks(query);
			return [];
		} catch (error) {
			console.error('Error searching tasks:', error);
			return [];
		}
	}

	function gotoTask(task: Task | string) {
		if (typeof task === 'string') {
			// TODO Open the create-task dialog / page
		} else {
			goto(`/tasks/?id=${task.id}`);
		}
	}
</script>

<div class={'app-header'}>
	{#if left}
		{@render left()}
	{:else}
		<AppPulloutMenu {user} />
	{/if}
	<!-- <SearchBar
		handleQuery={search}
		onItemSelected={gotoTask}
		placeholder="Search tasks..."
		defaultOptions={[{ title: 'Placeholder', completed: false } as Task]}
	>
		{#snippet children(task)}
			{#if typeof task === 'string'}
				<div class="task-search-result">
					<span class="task-title">{task}</span>
				</div>
			{:else}
				<div class="task-search-result">
					<span class="task-title">{task.title}</span>
					<span>{task.completed ? '👍' : '👎'}</span>
				</div>
			{/if}
		{/snippet}
	</SearchBar> -->
	{#if right}
		{@render right()}
	{:else}
		<UserAccountMenu {user} {authAPI} />
	{/if}
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

	.task-search-result {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;

		.task-title {
			flex: 1;
			text-align: left;
			font-weight: 500;
			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
		}

		// .task-deps {
		// 	color: var(--c-primary);
		// 	font-size: 0.8rem;
		// 	white-space: nowrap;
		// }
	}
</style>
