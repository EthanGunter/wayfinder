<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Task } from '$lib/API/Tasks/';
	import { onMount, type Snippet } from 'svelte';
	import UserAccountMenu from './UserAccountPulloutMenu.svelte';
	import { Button } from './ui/button';
	import SearchBar from './SearchBar.svelte';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';
	import UserAvatar from './UserAvatar.svelte';
	import { authState, cachedUsers as authUsers } from '@/API/Auth';
	import { tasksAPI } from '@/API/Tasks';
	import { isTaskCompleted } from '$lib/API/Tasks/Task';
	import { v4 } from 'uuid';

	interface Props {
		left?: Snippet;
		right?: Snippet;
		center?: Snippet;
		class?: string;
	}
	const { left, right, center, class: className }: Props = $props();

	// Google Forms URLs
	const FORMS = {
		bug: 'https://docs.google.com/forms/d/e/1FAIpQLSfG_C9I54vHhHgFM0xF2Je9fUgEGvmPDceNhSwOI_3oGU8SdA/viewform?usp=sf_link',
		feature:
			'https://docs.google.com/forms/d/e/1FAIpQLScP4Yz3kHHbCFVR4ogsTSB9_XJ_rVGPNuQcS71T4LsV0lSsmw/viewform?usp=sf_link'
	};
	let multipleUsers = $state(false);
	let recentTasks = $state<Task[]>([]);

	let authSheetOpen = $state(false);

	onMount(() => {
		// Subscribe to auth stores
		const unsubscribeAuthState = authState.subscribe(() => {
			// Load recent tasks when user changes
			loadRecentTasks();
		});

		const unsubscribeUsers = authUsers.subscribe((userList) => {
			multipleUsers = userList.length > 1;
		});

		loadRecentTasks();

		return () => {
			unsubscribeAuthState();
			unsubscribeUsers();
		};
	});

	async function loadRecentTasks() {
		if ($authState.status !== 'signed-in') return;
		try {
			const todaysTasks = await tasksAPI.getTodaysTasks();
			if (todaysTasks.isOk()) {
				recentTasks = todaysTasks.value.slice(0, 5); // Show up to 5 recent tasks
			}
		} catch (e) {
			console.error('Failed to load recent tasks:', e);
		}
	}

	async function resetWalkthrough() {
		if ($authState.status !== 'signed-in') return;
		const confirmed = confirm(
			'This will permanently delete all your tasks and reset all tutorials. Continue?'
		);
		if (!confirmed) return;
		const all = await tasksAPI.getAllUserTasks({ userId: $authState.user.id });
		if (all.isOk()) {
			const list = all.value.successes;
			if (list.length > 0) {
				await tasksAPI.deleteTasks({ ids: list.map((task) => task.id) });
			}
		}
		try {
			localStorage.removeItem('wf.tutorials.v1');
		} catch {}
		location.reload();
	}

	async function search(query: string): Promise<Task[]> {
		try {
			if (!query.trim()) {
				return [];
			}
			return await tasksAPI.searchTasks(query.trim());
		} catch (error) {
			console.error('Error searching tasks:', error);
			return [];
		}
	}

	async function gotoTask(task: Task | string) {
		if (typeof task === 'string') {
			// Create a new task with this title
			if ($authState.status === 'signed-in') {
				try {
					const result = await tasksAPI.createTask({
						createDetail: {
							id: v4(),
							user_id: $authState.user.id,
							title: task
						}
					});
					if (result.isOk()) {
						goto(`/tasks/?id=${result.value}`);
					} else {
						console.error('Failed to create task:', result.error);
					}
				} catch (error) {
					console.error('Error creating task:', error);
				}
			}
		} else {
			goto(`/tasks/?id=${task.id}`);
		}
	}
</script>

<div
	class="page-header flex items-center justify-between gap-4 bg-white p-4 text-gray-600 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] {className}"
>
	{#if left}
		{@render left()}
	{:else}
		<Sheet.Root>
			<Sheet.Trigger>
				<Button id="btn-feedback" class="size-12">
					<Icon icon="material-symbols:feedback-outline" class="size-5" />
				</Button>
			</Sheet.Trigger>
			<Sheet.Content side="left" class="w-80">
				<Sheet.Header>
					<Sheet.Title>Help & Feedback</Sheet.Title>
					<Sheet.Description>
						Report bugs or suggest features to help improve Wayfinder
					</Sheet.Description>
				</Sheet.Header>

				<div class="mt-6 flex flex-col gap-4">
					<!-- TODO:MOBILE can't open new webpages from a mobile app... -->
					<Button
						variant="outline"
						class="flex h-16 items-center justify-start gap-3"
						onclick={() => window.open(FORMS.bug, '_blank')}
					>
						<Icon icon="material-symbols:bug-report" class="size-6 text-red-600" />
						<div class="text-left">
							<div class="font-medium">Report a Bug</div>
							<div class="text-sm text-gray-500">Found something broken?</div>
						</div>
					</Button>

					<!-- TODO:MOBILE can't open new webpages from a mobile app... -->
					<Button
						variant="outline"
						class="flex h-16 items-center justify-start gap-3"
						onclick={() => window.open(FORMS.feature, '_blank')}
					>
						<Icon icon="material-symbols:lightbulb" class="size-6 text-blue-600" />
						<div class="text-left">
							<div class="font-medium">Suggest a Feature</div>
							<div class="text-sm text-gray-500">Share your ideas</div>
						</div>
					</Button>

					<!-- Reset Walkthrough -->
					<Button
						variant="outline"
						class="flex h-16 items-center justify-start gap-3"
						onclick={resetWalkthrough}
					>
						<Icon icon="material-symbols:refresh" class="size-6 text-gray-700" />
						<div class="text-left">
							<div class="font-medium">Reset Walkthrough</div>
							<div class="text-sm text-gray-500">Deletes tasks and resets tutorials</div>
						</div>
					</Button>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	{/if}

	{#if center}
		{@render center()}
	{:else}
		<SearchBar
			handleQuery={search}
			onItemSelected={gotoTask}
			placeholder="Search tasks..."
			defaultOptions={recentTasks}
		>
			{#snippet children(task)}
				{#if typeof task === 'string'}
					<div class="flex w-full items-center gap-2">
						<Icon icon="material-symbols:add" class="size-4 text-green-600" />
						<span
							class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap"
						>
							Create: {task}
						</span>
					</div>
				{:else}
					<div class="flex w-full items-center gap-2">
						<div class="flex items-center gap-1">
							{#if isTaskCompleted(task)}
								<Icon icon="material-symbols:check-circle" class="size-4 text-green-600" />
							{:else}
								<Icon icon="material-symbols:radio-button-unchecked" class="size-4 text-gray-400" />
							{/if}
							{#if task.todays_task}
								<Icon icon="material-symbols:today" class="size-3 text-blue-600" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="overflow-hidden font-medium text-ellipsis whitespace-nowrap">
								{task.title}
							</div>
							{#if task.content}
								<div class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-gray-500">
									{task.content.slice(0, 60)}{task.content.length > 60 ? '...' : ''}
								</div>
							{/if}
						</div>
						{#if task.priority && task.priority > 0}
							<span class="rounded bg-orange-100 px-1 text-xs text-orange-700">
								P{task.priority}
							</span>
						{/if}
					</div>
				{/if}
			{/snippet}
		</SearchBar>
	{/if}

	{#if right}
		{@render right()}
	{:else if $authState.status === 'signed-in'}
		<Sheet.Root bind:open={authSheetOpen}>
			<Sheet.Trigger>
				<div id="account-menu-btn" class="btn flex h-12 w-12 overflow-hidden rounded-full p-0">
					<UserAvatar user={$authState.user} />
				</div>
			</Sheet.Trigger>
			<Sheet.Content side="right" class="w-80">
				<UserAccountMenu onClose={() => (authSheetOpen = false)} />
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</div>
