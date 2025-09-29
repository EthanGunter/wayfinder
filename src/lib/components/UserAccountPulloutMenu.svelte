<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { userHasFeature, type User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import { authAPI, authState, cachedUsers as authUsers } from '@/API/Auth';
	import { tasksAPI } from '@/API/Tasks';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';
	import type { Task } from '$lib/API/Tasks/Task';

	let multipleUsers = $state(false);
	let hasSync = $derived(
		$authState.status === 'signed-in' && userHasFeature($authState.user, 'task-sync')
	);

	onMount(() => {
		const unsubscribeUsers = authUsers.subscribe((userList) => {
			multipleUsers = userList.length > 1;
		});

		return () => {
			unsubscribeUsers();
		};
	});

	async function handleExportJson() {
		if ($authState.status !== 'signed-in') return;
		const res = await tasksAPI.getAllUserTasks({ userId: $authState.user.id });
		if (res.isErr()) {
			res.error.logError();
			return;
		}
		const taskList = res.value.successes; /*.map((t: any) => {
			delete t.user_id;
			return t;
		}); */
		const exportBlob = new Blob([JSON.stringify(taskList, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(exportBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `wayfinder-${$authState.user.display_name.replaceAll(' ', '_')}-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportJson() {
		if ($authState.status !== 'signed-in') return;
		const t = tasksAPI;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const text = await file.text();
				const data = JSON.parse(text) as Task[];
				// Skip duplicates by id; ensure ownership is current user
				const ids = data.map((t) => t.id);
				const existing = await t.getTasks({ ids });
				let existingIds = new Set<string>();
				if (existing.isOk()) {
					existingIds = new Set(existing.value.successes.map((task) => task.id));
				}
				const createDetails = data
					.filter((t) => !existingIds.has(t.id))
					.map((t) => ({
						id: t.id,
						user_id: $authState.user.id,
						title: t.title,
						content: t.content,
						status: t.status,
						parents: t.parents,
						children: t.children,
						priority: t.priority,
						created: t.created,
						last_edit: t.last_edit
						// user_id will be set to current user by provider
					}));
				if (createDetails.length > 0) {
					await t.createTasks({ createDetails });
					invalidateAll();
				}
			} catch (e) {
				console.error('Import failed', e);
			}
		};
		input.click();
	}

	async function handleSignOut() {
		await authAPI.logout();
		invalidateAll();
	}

	function handleSwitchUser() {
		goto(`/login?mode=switch&redirect=${page.url.pathname + page.url.search}`);
	}
</script>

{#if $authState.status === 'signed-in'}
	<Sheet.Header>
		<Sheet.Title>Account</Sheet.Title>
		<Sheet.Description>
			{$authState.user.display_name}
		</Sheet.Description>
	</Sheet.Header>

	<div class="mt-6 flex flex-col gap-4">
		<Button
			variant="outline"
			class="flex h-16 items-center justify-start gap-3"
			onclick={() => goto(`/account?redirect=${page.url.pathname + page.url.search}`)}
		>
			<Icon icon="material-symbols:settings" class="size-6 text-gray-600" />
			<div class="text-left">
				<div class="font-medium">User Settings</div>
				<div class="text-sm text-gray-500">Manage your preferences</div>
			</div>
		</Button>

		<!-- Sign out -->
		<Button
			variant="outline"
			class="flex h-16 items-center justify-start gap-3"
			onclick={handleSignOut}
		>
			<Icon icon="material-symbols:logout" class="size-6 text-gray-600" />
			<div class="text-left">
				<div class="font-medium">Sign out</div>
				<div class="text-sm text-gray-500">Sign out of this device</div>
			</div>
		</Button>

		<!-- Switch user -->
		<Button
			variant="outline"
			class="flex h-16 items-center justify-start gap-3"
			onclick={handleSwitchUser}
		>
			<Icon icon="mdi:account-switch" class="size-6 text-gray-600" />
			<div class="text-left">
				<div class="font-medium">Switch user</div>
				<div class="text-sm text-gray-500">Choose another local account</div>
			</div>
		</Button>

		<hr />
		<h2>Backup</h2>
		<h3>Local Disk</h3>
		<span class="flew-row flex justify-around">
			<!-- Export JSON -->
			<Button
				variant="outline"
				class="flex h-10 items-center justify-start"
				onclick={handleExportJson}
				title="Download data as json file"
			>
				<Icon icon="mdi:export-variant" class="size-6 text-gray-600" />
				<div class="text-left">
					Export
					<!-- <div class="text-sm text-gray-500">Download your current task graph</div> -->
				</div>
			</Button>

			<!-- Import JSON -->
			<Button
				variant="outline"
				class="flex h-10 items-center justify-start"
				onclick={handleImportJson}
				title="Add json data to your task-list"
			>
				<Icon icon="mdi:import" class="size-6 text-gray-600" />
				<div class="text-left">
					Import
					<!-- <div class="text-sm text-gray-500">Merge JSON into your task graph</div> -->
				</div>
			</Button>
		</span>

		<h3>Server</h3>
		<span class="flew-row flex justify-around">
			<!-- Fetch from server -->
			<span
				title={hasSync
					? "Replace local data with the server's"
					: 'Cannot fetch from server without sync-enabled account'}
			>
				<Button
					variant="outline"
					class="flex h-10 items-center justify-start"
					onclick={handleImportJson}
					disabled={!hasSync}
				>
					<Icon icon="mdi:import" class="size-6 text-gray-600" />
					<div class="text-left">
						Fetch
						<!-- <div class="text-sm text-gray-500">Merge JSON into your task graph</div> -->
					</div>
				</Button>
			</span>

			<!-- Force push to server -->
			<span
				title={hasSync
					? "Overwrite the server's data with what's here"
					: 'Cannot force-push from server without sync-enabled account'}
			>
				<Button
					variant="outline"
					class="flex h-10 items-center justify-start"
					onclick={handleExportJson}
					disabled={!hasSync}
				>
					<Icon icon="mdi:export-variant" class="size-6 text-gray-600" />
					<div class="text-left">
						Push
						<!-- <div class="text-sm text-gray-500">Download your current task graph</div> -->
					</div>
				</Button>
			</span>
		</span>
	</div>
{/if}
