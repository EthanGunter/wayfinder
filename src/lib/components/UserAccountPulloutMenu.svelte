<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { type User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import { authAPIPromise, taskAPIPromise } from '$lib/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';
	import type { ILocalTasks } from '$lib/API/Tasks';
	import type { Task } from '$lib/API/Tasks/Task';

	let auth = $state<ILocalAuth>();
	let user = $state<User>();
	let multipleUsers = $state(false);
	let tasks = $state<ILocalTasks>();

	onMount(async () => {
		auth = await authAPIPromise;
		user = (await auth.getActiveUser()) ?? undefined;
		multipleUsers = (await auth.listUsers()).length > 1;
		tasks = await taskAPIPromise;
	});

	async function handleExportJson() {
		if (!tasks || !user) return;
		const t = tasks as ILocalTasks;
		const res = await t.getAllUserTasks({ userId: user!.id });
		if (res.isErr()) return;
		const taskList = res.value.filter((r) => r.isOk()).map((r) => r._unsafeUnwrap());
		const exportBlob = new Blob([JSON.stringify(taskList, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(exportBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'wayfinder-tasks.json';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportJson() {
		if (!tasks || !user) return;
		const t = tasks as ILocalTasks;
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
					existingIds = new Set(
						existing.value.filter((r) => r.isOk()).map((r) => r._unsafeUnwrap().id)
					);
				}
				const createDetails = data
					.filter((t) => !existingIds.has(t.id))
					.map((t) => ({
						id: t.id,
						user_id: user!.id,
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
</script>

{#if auth && user}
	<Sheet.Header>
		<Sheet.Title>Account</Sheet.Title>
		<Sheet.Description>
			{user.display_name}
		</Sheet.Description>
	</Sheet.Header>

	<div class="mt-6 flex flex-col gap-4">
		{#if user}
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
		{/if}

		<!-- Export JSON -->
		<Button
			variant="outline"
			class="flex h-16 items-center justify-start gap-3"
			onclick={handleExportJson}
		>
			<Icon icon="mdi:export-variant" class="size-6 text-gray-600" />
			<div class="text-left">
				<div class="font-medium">Export Tasks (JSON)</div>
				<div class="text-sm text-gray-500">Download your current task graph</div>
			</div>
		</Button>

		<!-- Import JSON -->
		<Button
			variant="outline"
			class="flex h-16 items-center justify-start gap-3"
			onclick={handleImportJson}
		>
			<Icon icon="mdi:import" class="size-6 text-gray-600" />
			<div class="text-left">
				<div class="font-medium">Import Tasks (JSON)</div>
				<div class="text-sm text-gray-500">Merge JSON into your task graph</div>
			</div>
		</Button>
	</div>
{/if}
