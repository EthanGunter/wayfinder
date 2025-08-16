<script lang="ts">
	import { goto } from '$app/navigation';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import type { Task } from '$lib/API/Tasks/';
	import { onMount, type Snippet } from 'svelte';
	import UserAccountMenu from './UserAccountPulloutMenu.svelte';
	import type { LocalUser, User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import BugReport from './BugReport.svelte';
	import SearchBar from './SearchBar.svelte';
	import Icon from '@iconify/svelte';
	import * as Dialog from './ui/dialog';
	import * as Sheet from './ui/sheet';
	import UserAvatar from './UserAvatar.svelte';
	import { authAPIPromise } from '@/stores/services';

	interface Props {
		left?: Snippet;
		right?: Snippet;
		center?: Snippet;
		class?: string;
	}
	const { left, right, center, class: className }: Props = $props();
	let bugDiagOpen = $state(false);
	let user = $state<User | null>(null);
	let multipleUsers = $state(false);

	onMount(async () => {
		const auth = await authAPIPromise;
		user = await auth.getActiveUser();
		multipleUsers = (await auth.listUsers()).length > 1;
	});

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
	class="{className} flex items-center justify-between gap-4 bg-white p-4 text-gray-600 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)]"
>
	{#if left}
		{@render left()}
	{:else}
		<Dialog.Root bind:open={bugDiagOpen}>
			<Dialog.Trigger>
				<Button>
					<Icon icon="lucide:bug" />
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

	{#if center}
		{@render center()}
	{:else}
		<SearchBar
			handleQuery={search}
			onItemSelected={gotoTask}
			placeholder="Search tasks..."
			defaultOptions={[{ title: 'Placeholder', completed: false } as Task]}
		>
			{#snippet children(task)}
				{#if typeof task === 'string'}
					<div class="flex w-full items-center gap-2">
						<span
							class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap"
							>{task}</span
						>
					</div>
				{:else}
					<div class="flex w-full items-center gap-2">
						<span
							class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap"
							>{task.title}</span
						>
						<span>{task.completed ? '👍' : '👎'}</span>
					</div>
				{/if}
			{/snippet}
		</SearchBar>
	{/if}

	{#if right}
		{@render right()}
	{:else if user}
		<Sheet.Root>
			<Sheet.Trigger>
				<div id="account-menu-btn" class="flex h-12 w-12 overflow-hidden rounded-full p-0">
					<UserAvatar {user} />
				</div>
			</Sheet.Trigger>
			<Sheet.Content>
				<UserAccountMenu />
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</div>
