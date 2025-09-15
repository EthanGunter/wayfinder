<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { isAnonymous, type LocalUser, type User } from '$lib/API/Auth/User';
	import { page } from '$app/state';
	import { Button } from '@/components/ui/button';
	import { authAPIPromise, taskAPIPromise } from '@/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import AvatarEditor from '@/components/AvatarEditor.svelte';
	import * as AlertDialog from '@/components/ui/alert-dialog';
	import type { ILocalTasks } from '@/API/Tasks/types';
	import { extractBatchAndLogErrors } from '@/API/types';
	import { Err } from '@/Errors';

	let originalUser = $state<User>();
	let user = $state<User>();
	let auth = $state<ILocalAuth>();
	let tasks = $state<ILocalTasks>();
	let taskCount = $state<number>(0);
	let isDeleting = $state(false);

	const debouncedUpdateUser = $derived(auth ? debounce(auth.updateUser, 200) : undefined);

	onMount(async () => {
		auth = await authAPIPromise;
		tasks = await taskAPIPromise;
		const active = await auth.getActiveUser();

		if (!active) {
			goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			return;
		} else if (isAnonymous(active)) {
			goto(`/`);
			return;
		}
		user = active;
		originalUser = { ...user };

		// Count user's tasks for delete warning
		await loadTaskCount();
	});

	async function loadTaskCount() {
		if (!tasks || !user) return;

		try {
			const result = await tasks.getAllUserTasks({ userId: user.id });
			if (result.isOk()) {
				const userTasks = extractBatchAndLogErrors(result);
				taskCount = userTasks.length;
			}
		} catch (error) {
			console.error('Failed to load task count:', error);
			taskCount = 0;
		}
	}

	function equals(a: LocalUser, b: LocalUser) {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	async function saveUserChanges() {
		if (!user || !originalUser) return;

		const changes: Partial<User> = {};
		if (originalUser.display_name != user.display_name) {
			changes.display_name = user.display_name;
		}
		if (originalUser.avatar_url != user.avatar_url) {
			changes.avatar_url = user.avatar_url;
		}

		// Only update if there are actual changes
		if (user && changes && Object.keys(changes).length > 0) {
			await debouncedUpdateUser!({
				update: {
					id: user!.id,
					...changes
				}
			});
			await auth!.updateUser({ update: { ...changes, id: user.id } });
			originalUser = user;
			await invalidateAll();
		}
	}

	function handleNameInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		event.preventDefault();
		// if (event.currentTarget.value === '') user.display_name = data.user.display_name;
	}
	async function handleDeleteUser() {
		if (!auth || !user || isDeleting) return;

		isDeleting = true;
		try {
			const rootRes = await tasks!.getRootTasks();
			if (rootRes.isErr()) Err.UNHANDLED(rootRes.error);

			await tasks!.deleteTasks({
				deleteArgs: rootRes.value.map((r) => ({ id: r.id, recursive: true }))
			});
			
			// Delete the user account
			const deleteRes = await auth.deleteUser({ userId: user.id });
			if (deleteRes.isErr()) Err.UNHANDLED(deleteRes.error);

			const defaultUserResult = await auth.getDefaultUser();
			if (defaultUserResult.isOk()) {
				await auth.switchUser(defaultUserResult.value.id);
			}

			// Redirect to login page since current user is deleted
			goto('/login');
		} catch (error) {
			console.error('Failed to delete user:', error);
			isDeleting = false;
		}
	}

	function goBack() {
		const redirect = page.url.searchParams.get('redirect');
		if (redirect) {
			goto(redirect);
		} else {
			goto('/');
		}
	}
</script>

{#if auth && user}
	<div
		id="account-page"
		class=" grid-areas-[header_content_footer] relative grid h-full w-full grid-rows-[auto_1fr_auto] bg-gray-200"
	>
		<AppHeader>
			{#snippet left()}
				<Button onclick={goBack}>Back</Button>
			{/snippet}
			{#snippet center()}{/snippet}
			{#snippet right()}{/snippet}
		</AppHeader>
		<div
			class="grid-area-content mx-auto flex w-full max-w-[25rem] min-w-80 flex-col items-center justify-center gap-4 overflow-y-scroll p-4"
		>
			<div class="grid min-w-[70%] gap-4">
				<AvatarEditor {user} class="m-auto max-h-[50vh] max-w-[50vw]" />
				<span class="flex flex-col">
					<label for="input_display_name" class="mb-2 font-medium text-gray-800">Name</label>
					<input
						id="input_display_name"
						type="text"
						bind:value={user.display_name}
						oninput={handleNameInput}
						placeholder="Really cool username"
						class="rounded border border-gray-300 p-2"
					/>
				</span>
				<!-- TODO Local Passkey <section id="sec-passkey">
				<Button>Passkey</Button>
				<input
				id="input_passkey"
				type="password"
				bind:value={user.passkey}
				oninput={handlePasswordInput}
				/>
				</section> -->
				<!-- TODO App themes <section id="sec-theme">
					<label for="select_theme">Theme</label>
					<select id="select_theme">
						<option>Light</option>
						<option>Dark</option>
						</select>
						</section> -->
			</div>
			<Button onclick={saveUserChanges} disabled={equals(user, originalUser!)}>Save Changes</Button>

			<!-- Delete Account Dialog -->
			<AlertDialog.Root>
				<AlertDialog.Trigger>
					<Button variant="destructive" class="w-full">Delete Account</Button>
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete Account</AlertDialog.Title>
						<AlertDialog.Description>
							Are you sure you want to delete your account? This action cannot be undone.
							{#if taskCount > 0}
								<br /><br />
								<strong>Warning:</strong> This will also delete {taskCount} task{taskCount === 1
									? ''
									: 's'} associated with this account.
							{/if}
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action
							onclick={handleDeleteUser}
							disabled={isDeleting}
							class="bg-red-600 hover:bg-red-700"
						>
							{isDeleting ? 'Deleting...' : 'Delete Account'}
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>

			<!-- 			{#if !userHasFeature(user, 'task-sync')}
				<div class="rounded-lg bg-gray-50 p-8 text-center">
					<h2 class="m-0 mb-2 text-gray-800">Upgrade to Cloud Sync</h2>
					<p class="mb-6 text-gray-600">
						Sync your data across devices and enable premium features
					</p>
					<ul class="m-0 mx-auto mb-8 max-w-xs list-none p-0 text-left">
						<li class="py-2 text-gray-800">✓ Access your data from any device</li>
						<li class="py-2 text-gray-800">✓ Automatic backups</li>
						<li class="py-2 text-gray-800">✓ Real-time synchronization</li>
						<li class="py-2 text-gray-800">✓ Priority support</li>
					</ul>
					<Button
						class="bg-gradient-to-br from-blue-400 to-purple-600 p-4 px-8 text-lg text-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)]"
						onclick={async () => {
							await saveUserChanges();
							goto('/account/upgrade');
						}}
					>
						Upgrade to Cloud Sync
					</Button>
				</div>
			{/if} -->
			<Button class="alert" onclick={auth.logout}>Sign out</Button>
		</div>
		<AppFooter />
	</div>
{/if}
