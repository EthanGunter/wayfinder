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

<div class="flex items-center justify-between gap-4 p-4 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] text-gray-600 bg-white">
	{#if left}
		{@render left()}
	{:else}
		<AppPulloutMenu />
	{/if}
	<!-- <SearchBar
		handleQuery={search}
		onItemSelected={gotoTask}
		placeholder="Search tasks..."
		defaultOptions={[{ title: 'Placeholder', completed: false } as Task]}
	>
		{#snippet children(task)}
			{#if typeof task === 'string'}
				<div class="flex items-center gap-2 w-full">
					<span class="flex-1 text-left font-medium whitespace-nowrap text-ellipsis overflow-hidden">{task}</span>
				</div>
			{:else}
				<div class="flex items-center gap-2 w-full">
					<span class="flex-1 text-left font-medium whitespace-nowrap text-ellipsis overflow-hidden">{task.title}</span>
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
