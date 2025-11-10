<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	/* 	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload'; */
	import { authAPI, authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import type { User } from '$domain/models/user';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import Icon from '@iconify/svelte';

	let { user }: { user: User } = $props();
	const sidebar = useSidebar();

	let importDialogOpen = $state(false);

	function getFallbackName(displayName: string): string {
		const split = displayName.split(' ');
		if (split.length > 1) {
			return split[0][0] + split[1][0];
		} else {
			return displayName.substring(0, 2);
		}
	}

	async function handleExport() {
		if ($authState.status !== 'signed-in') return;
		const data = await tasksAPI.exportData();

		const exportBlob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(exportBlob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `wayfinder-${$authState.user.displayName.replaceAll(' ', '_')}-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
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
	}

	async function handleSignOut() {
		await authAPI.logout();
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						{...props}
					>
						<UserAvatar class="size-8 rounded-lg" />
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{user.displayName}</span>
							<!-- {#if user.email}
								<span class="truncate text-xs">{user.email}</span>
							{/if} -->
						</div>
						<Icon icon="lucide:chevron-down" class="ml-auto size-4" />
						<!-- <ChevronsUpDownIcon class="ml-auto size-4" /> -->
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				side={sidebar.isMobile ? 'bottom' : 'right'}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
						<UserAvatar class="size-8 rounded-lg" />
						<div class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">{user.displayName}</span>
							<!-- {#if user.email}
								<span class="truncate text-xs">{user.email}</span>
							{/if} -->
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item
						onclick={() => goto(`/account?redirect=${$page.url.pathname + $page.url.search}`)}
					>
						<Icon icon="lucide:settings" class="size-4" />
						<!-- <SettingsIcon class="size-4" /> -->
						User Settings
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={handleExport}>
						<Icon icon="lucide:download" class="size-4" />
						<!-- <DownloadIcon class="size-4" /> -->
						Export Data
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={handleImport}>
						<Icon icon="lucide:upload" class="size-4" />
						<!-- <UploadIcon class="size-4" /> -->
						Import Data
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={handleSignOut}>
					<Icon icon="lucide:log-out" class="size-4" />
					<!-- <LogOutIcon class="size-4" /> -->
					Sign out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

<Dialog.Root bind:open={importDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Import Data</Dialog.Title>
			<Dialog.Description>Choose how to handle the imported data.</Dialog.Description>
		</Dialog.Header>

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

		<Button onclick={() => (importDialogOpen = false)}>Cancel</Button>
	</Dialog.Content>
</Dialog.Root>
