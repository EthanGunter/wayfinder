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
	import { Tabs, TabsTrigger, TabsList, TabsContent } from './ui/tabs';
	import UserAvatar from './UserAvatar.svelte';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import Feedback from './Feedback.svelte';
	import type { ILocalTasks } from '@/API/Tasks';

	interface Props {
		left?: Snippet;
		right?: Snippet;
		center?: Snippet;
		class?: string;
	}
	const { left, right, center, class: className }: Props = $props();
	let feedbacDiagOpen = $state(false);
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
		<Dialog.Root bind:open={feedbacDiagOpen}>
			<Dialog.Trigger>
				<Button class="size-12">
					<Icon icon="material-symbols:feedback-outline" class=" size-5" />
				</Button>
			</Dialog.Trigger>
			<Dialog.Content>
				<Tabs>
					<TabsList>
						<TabsTrigger value="feedback">Feedback</TabsTrigger>
						<TabsTrigger value="bugreport">Bug Report</TabsTrigger>
					</TabsList>
					<TabsContent value="bugreport">
						<BugReport
							onSubmit={() => {
								feedbacDiagOpen = false;
							}}
						/>
					</TabsContent>
					<TabsContent value="feedback">
						<Feedback
							onSubmit={() => {
								feedbacDiagOpen = false;
							}}
						/>
					</TabsContent>
				</Tabs>
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
			defaultOptions={recentTasks}
		>
			{#snippet children(task)}
				{#if typeof task === 'string'}
					<div class="flex w-full items-center gap-2">
						<Icon icon="material-symbols:add" class="size-4 text-green-600" />
						<span class="flex-1 overflow-hidden text-left font-medium text-ellipsis whitespace-nowrap">
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
						<div class="flex-1 min-w-0">
							<div class="font-medium text-ellipsis whitespace-nowrap overflow-hidden">
								{task.title}
							</div>
							{#if task.content}
								<div class="text-xs text-gray-500 text-ellipsis whitespace-nowrap overflow-hidden">
									{task.content.slice(0, 60)}{task.content.length > 60 ? '...' : ''}
								</div>
							{/if}
						</div>
						{#if task.priority && task.priority > 0}
							<span class="text-xs bg-orange-100 text-orange-700 px-1 rounded">
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
				<div id="account-menu-btn" class="flex h-12 w-12 overflow-hidden rounded-full p-0 btn">
					<UserAvatar {user} />
				</div>
			</Sheet.Trigger>
			<Sheet.Content>
				<UserAccountMenu />
			</Sheet.Content>
		</Sheet.Root>
	{/if}
</div>
