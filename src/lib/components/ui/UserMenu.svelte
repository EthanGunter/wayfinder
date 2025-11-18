<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import Icon from '@iconify/svelte';
	import type { User } from '$domain/models/user';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { authAPI, authState } from '$lib/API/Auth';
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import tasksAPI from '$lib/API/Tasks';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = {
		user?: User;
		onItemClick?: (item: string) => void;
	};

	const { user: _user, onItemClick }: Props = $props();

	let user = $derived(_user ?? ($authState.status === 'signed-in' ? $authState.user : undefined));

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

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="h-full">
		<Button variant="ghost" class="h-9 px-2 py-0 hover:bg-accent hover:text-accent-foreground">
			<UserAvatar {user} />
			<Icon icon="lucide:chevron-down" class="ml-1 h-3 w-3" />
			<span class="sr-only">User menu</span>
		</Button>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56">
		<DropdownMenu.Label>
			<div class="flex flex-col space-y-1">
				<p class="text-sm leading-none font-medium">
					<span id="user-name">{user?.displayName}</span>
				</p>
			</div>
		</DropdownMenu.Label>

		<DropdownMenu.Separator />

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
	</DropdownMenu.Content>
</DropdownMenu.Root>

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
