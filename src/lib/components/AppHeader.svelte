<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import Logo from './Logo.svelte';
	import * as DropdownMenu from './ui/dropdown-menu';
	import { NotificationMenu } from './ui/navbar';
	import * as NavigationMenu from './ui/navigation-menu';
	import { Separator } from './ui/separator';
	import UserMenu from './ui/UserMenu.svelte';
	import { authAPI, authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import * as Dialog from './ui/dialog';
	import { Button } from './ui/button';
	import { page } from '$app/state';

	type Props = {};
	const {}: Props = $props();

	let importDialogOpen = $state(false);

	async function handleExport() {
		if ($authState.status !== 'signed-in') return;
		const data = await tasksAPI.exportData();

		const exportBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
</script>

<div class="relative z-100 flex h-[var(--header-height)] w-full gap-6 bg-background shadow-sm">
	<Logo />
	<NavigationMenu.Root>
		<NavigationMenu.List>
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/planner'} href="/planner">
					Planner
				</NavigationMenu.Link>
			</NavigationMenu.Item>
			<Separator orientation="vertical" />
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/graph'} href="/graph">
					Graph
				</NavigationMenu.Link>
			</NavigationMenu.Item>
		</NavigationMenu.List>
	</NavigationMenu.Root>
	<div class="ml-auto">
		<!-- <NotificationMenu /> -->
		<UserMenu>
			<DropdownMenu.Group>
				<DropdownMenu.Item
					onclick={() => {
						goto('/account');
					}}
				>
					Settings
				</DropdownMenu.Item>
			</DropdownMenu.Group>
			<DropdownMenu.Group>
				<DropdownMenu.Item onclick={handleExport}>
					<Icon icon="lucide:download" />
					<!-- <DownloadIcon class="size-4" /> -->
					Export Data
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={handleImport}>
					<Icon icon="lucide:upload" />
					<!-- <UploadIcon class="size-4" /> -->
					Import Data
				</DropdownMenu.Item>
			</DropdownMenu.Group>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={() => authAPI.logout()}>Logout</DropdownMenu.Item>
		</UserMenu>
	</div>
</div>

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
