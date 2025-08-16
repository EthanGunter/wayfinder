<script lang="ts">
	import { goto } from '$app/navigation';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import type { Task } from '$lib/API/Tasks/';
	import type { Snippet } from 'svelte';
	import AppPulloutMenu from './AppPulloutMenu.svelte';
	import UserAccountMenu from './UserAccountPulloutMenu.svelte';
	import type { LocalUser } from '$lib/API/Auth/User';
	import * as Sheet from './ui/sheet';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';
	import BugReport from './BugReport.svelte';
	import SearchBar from './SearchBar.svelte';
	import Icon from '@iconify/svelte';

	interface Props {
		user: LocalUser;
		authAPI: IAuthAPI;
		left?: Snippet;
		right?: Snippet;
	}
	const { user, authAPI, left, right }: Props = $props();
	let bugDiagOpen = $state(false);

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

<div
	class="flex items-center justify-between gap-4 bg-white p-4 text-gray-600 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)]"
>
	{#if left}
		{@render left()}
	{:else}
		<Dialog.Root bind:open={bugDiagOpen}>
			<Dialog.Trigger>
				<Button>
					<Icon icon="lucide:bug"/>
				</Button>
			</Dialog.Trigger>
			<Dialog.Content>
				<BugReport
					onSubmit={() => {
						bugDiagOpen = false;
					}}
				/>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
	<SearchBar
		handleQuery={search}
		onItemSelected={gotoTask}
		placeholder="Search tasks..."
		defaultOptions={[{ title: 'Placeholder', completed: false } as Task]}
	>
		{#snippet children(task)}
			{#if typeof task === 'string'}
				<div class="flex w-full items-center gap-2">
					<span class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap"
						>{task}</span
					>
				</div>
			{:else}
				<div class="flex w-full items-center gap-2">
					<span class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap"
						>{task.title}</span
					>
					<span>{task.completed ? '👍' : '👎'}</span>
				</div>
			{/if}
		{/snippet}
	</SearchBar>
	{#if right}
		{@render right()}
	{:else}
		<UserAccountMenu {user} {authAPI} />
	{/if}
</div>
