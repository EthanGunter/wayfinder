<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { isAnonymous, type User } from '$lib/API/Auth/User';
	import { Button } from './ui/button';
	import { authAPIPromise } from '$lib/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import Icon from '@iconify/svelte';
	import * as Sheet from './ui/sheet';

	let auth = $state<ILocalAuth>();
	let user = $state<User>();
	let multipleUsers = $state(false);

	onMount(async () => {
		auth = await authAPIPromise;
		user = (await auth.getActiveUser()) ?? undefined;
		multipleUsers = (await auth.listUsers()).length > 1;
	});
</script>

{#if auth && user}
	<Sheet.Header>
		<Sheet.Title>Account</Sheet.Title>
		<Sheet.Description>
			{user.display_name}
		</Sheet.Description>
	</Sheet.Header>
	
	<div class="flex flex-col gap-4 mt-6">
		{#if isAnonymous(user!)}
			<Button 
				variant="outline" 
				class="flex items-center gap-3 h-16 justify-start"
				onclick={() => goto(`/register?redirect=${page.url.pathname + page.url.search}`)}
			>
				<Icon icon="material-symbols:person-add" class="size-6 text-blue-600" />
				<div class="text-left">
					<div class="font-medium">Customize Account</div>
					<div class="text-sm text-gray-500">Create a personalized profile</div>
				</div>
			</Button>
		{:else}
			<Button 
				variant="outline" 
				class="flex items-center gap-3 h-16 justify-start"
				onclick={() => goto(`/account?redirect=${page.url.pathname + page.url.search}`)}
			>
				<Icon icon="material-symbols:settings" class="size-6 text-gray-600" />
				<div class="text-left">
					<div class="font-medium">User Settings</div>
					<div class="text-sm text-gray-500">Manage your preferences</div>
				</div>
			</Button>

			<Button 
				variant="outline" 
				class="flex items-center gap-3 h-16 justify-start"
				onclick={() => {
					goto(`/login?redirect=${page.url.pathname + page.url.search}`);
				}}
			>
				<Icon icon="material-symbols:switch-account" class="size-6 text-purple-600" />
				<div class="text-left">
					<div class="font-medium">Switch User</div>
					<div class="text-sm text-gray-500">Change to a different account</div>
				</div>
			</Button>
		{/if}
		
		{#if !isAnonymous(user)}
			<Button 
				variant="outline" 
				class="flex items-center gap-3 h-16 justify-start"
				onclick={async () => {
					await auth!.logout();
					goto('/');
				}}
			>
				<Icon icon="material-symbols:logout" class="size-6 text-red-600" />
				<div class="text-left">
					<div class="font-medium">Sign Out</div>
					<div class="text-sm text-gray-500">Leave this session</div>
				</div>
			</Button>
		{/if}
	</div>
{/if}
