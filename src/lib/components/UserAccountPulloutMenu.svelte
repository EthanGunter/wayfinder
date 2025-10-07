<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from './ui/button';
	import { authAPI, authState, cachedUsers as authUsers } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import { onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';
	import * as Dialog from './ui/dialog';
	import { Err } from '$domain/errors';
	import { userHasFeature } from '$domain/models/user';

	interface Props {
		onClose?: () => void;
	}
	const { onClose }: Props = $props();

	let multipleUsers = $state(false);
	let hasSync = $derived(
		$authState.status === 'signed-in' && userHasFeature($authState.user, 'task-sync')
	);

	let importDialogOpen = $state(false);

	onMount(() => {
		const unsubscribeUsers = authUsers.subscribe((userList) => {
			multipleUsers = userList.length > 1;
		});

		return () => {
			unsubscribeUsers();
		};
	});

	async function handleExport() {
		if ($authState.status !== 'signed-in') return;
		const data = await tasksAPI.exportData();

		const exportBlob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(exportBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `wayfinder-${$authState.user.display_name.replaceAll(' ', '_')}-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
		onClose?.();
	}

	function handleImport() {
		importDialogOpen = true;
	}

	async function executeImport(mode: 'add' | 'replace') {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json';

		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;

			const text = await file.text();
			await tasksAPI.importData({ data: text, mode });
			importDialogOpen = false;
		};

		input.click();
		onClose?.();
	}

	async function handleSignOut() {
		await authAPI.logout();
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

		<hr />
		<h2>Backup</h2>
		<!-- <h3>Local Disk</h3> -->
		<span class="flew-row flex justify-around">
			<!-- Export JSON -->
			<Button
				variant="outline"
				class="flex h-10 items-center justify-start"
				onclick={handleExport}
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
				onclick={handleImport}
				title="Add json data to your task-list"
			>
				<Icon icon="mdi:import" class="size-6 text-gray-600" />
				<div class="text-left">
					Import
					<!-- <div class="text-sm text-gray-500">Merge JSON into your task graph</div> -->
				</div>
			</Button>
		</span>

		{#if false}
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
						onclick={() => Err.NotImplemented('Server Fetch')}
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
						onclick={() => Err.NotImplemented('Overwrite Server')}
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
		{/if}
	</div>
{/if}

<Dialog.Root bind:open={importDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Import Data</Dialog.Title>
			<Dialog.Description>Choose how to handle the imported data.</Dialog.Description>
		</Dialog.Header>

		<!-- <div class="flex flex-col gap-3"> -->
		<Button
			variant="outline"
			class="flex h-auto flex-col items-start gap-1 p-4"
			onclick={() => executeImport('add')}
		>
			<div class="font-semibold">Add</div>
			<div class="text-sm text-gray-500">Import data as new nodes</div>
		</Button>

		<Button
			variant="outline"
			class="flex h-auto flex-col items-start gap-1 p-4"
			onclick={() => executeImport('replace')}
		>
			<div class="font-semibold text-destructive">Replace</div>
			<div class="text-sm text-gray-500">Delete everything, then import</div>
			<div class="text-sm text-red-500 italic">Warning: this is irreversible!</div>
		</Button>
		<!-- </div> -->

		<Button onclick={() => (importDialogOpen = false)}>Cancel</Button>
	</Dialog.Content>
</Dialog.Root>
