<script lang="ts">
	import { goto } from '$app/navigation';
	import type { IAuthAPI } from '$lib/API/Auth/types';
	import type { Task } from '$lib/API/Tasks/';
	import { onMount, type Snippet } from 'svelte';
	import UserAccountMenu from './UserAccountPulloutMenu.svelte';
	import type { LocalUser, User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import SearchBar from './SearchBar.svelte';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';
	import UserAvatar from './UserAvatar.svelte';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import type { ILocalTasks } from '@/API/Tasks';

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
	let user = $state<User | null>(null);
	let multipleUsers = $state(false);
	let tasks = $state<ILocalTasks | null>(null);
	let recentTasks = $state<Task[]>([]);

	onMount(async () => {
		const auth = await authAPIPromise;
		user = await auth.getActiveUser();
		multipleUsers = (await auth.listUsers()).length > 1;

		// Initialize task API for search
		tasks = await taskAPIPromise;

		// Load recent tasks for default options
		if (user) {
			const todaysTasks = await tasks.getTodaysTasks();
			if (todaysTasks.isOk()) {
				recentTasks = todaysTasks.value.slice(0, 5); // Show up to 5 recent tasks
			}
		}
	});

	async function search(query: string): Promise<Task[]> {
		try {
			if (!tasks || !query.trim()) {
				return [];
			}
			return await tasks.searchTasks(query.trim());
		} catch (error) {
			console.error('Error searching tasks:', error);
			return [];
		}
	}

	async function gotoTask(task: Task | string) {
		if (typeof task === 'string') {
			// Create a new task with this title
			if (tasks && user) {
				try {
					const result = await tasks.createTask({
						createDetail: {
							user_id: user.id,
							title: task
						}
					});
					if (result.isOk()) {
						goto(`/tasks/?id=${result.value.id}`);
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
	class="flex items-center justify-between gap-4 bg-white p-4 text-gray-600 shadow-[0px_0px_20px_0px_rgba(25,24,24,0.32)] {className}"
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
							{#if task.completed}
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
	{:else if user}
		<Sheet.Root>
			<Sheet.Trigger>
				<div id="account-menu-btn" class="btn flex h-12 w-12 overflow-hidden rounded-full p-0">
					<UserAvatar {user} />
				</div>
			</Sheet.Trigger>
			<Sheet.Content side="right" class="w-80">
				<UserAccountMenu />
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</div>
