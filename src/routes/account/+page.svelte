<script lang="ts">
	import { goto } from '$app/navigation';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { authAPI, authState } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import { onMount } from 'svelte';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Err } from '$domain/errors';
	import UserSettings from '$lib/user-settings/UserSettings.svelte';

	let taskCount = $state<number>(0);
	let isDeleting = $state(false);
	let draftName = $state<string>('');

	const debouncedUpdateUser = debounce(authAPI.updateUser, 200);

	onMount(() => {
		// Subscribe to auth state
		const unsubscribeAuth = authState.subscribe((state) => {
			if (state.status === 'signed-in' && state.user) {
				// keep draft in sync with store (but do not write back)
				if (draftName !== state.user.display_name) draftName = state.user.display_name;
				loadTaskCount();
			} else if (state.status === 'signed-out') {
				goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			}
		});

		return () => {
			unsubscribeAuth();
		};
	});

	async function loadTaskCount() {
		if ($authState.status !== 'signed-in') return;

		const [userTasks, error] = await tasksAPI.getAllUserTasks({ userId: $authState.user.id });
		if (userTasks) {
			taskCount = userTasks.length;
		} else {
			console.error('Failed to load task count:', error);
			taskCount = 0;
		}
	}

	async function handleDeleteUser() {
		if ($authState.status !== 'signed-in' || isDeleting) return;

		isDeleting = true;
		try {
			const [roots, getRootsError] = await tasksAPI.getRootTasks();
			if (getRootsError) Err.UNHANDLED(getRootsError);

			await tasksAPI.deleteTasks({
				ids: roots.map((r) => r.id)
			});

			// Delete the user account
			const [_, deleteUserError] = await authAPI.deleteUser({ userId: $authState.user.id });
			if (deleteUserError) Err.UNHANDLED(deleteUserError);

			// TODO:Temp anonymous accounts disabled
			/* const defaultUserResult = await auth.getDefaultUser();
			if (defaultUserResult.isOk()) {
				await auth.switchUser(defaultUserResult.value.id);
			} */

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

{#if $authState.status === 'signed-in'}
	<div id="account-page" class="page-root relative h-full w-full bg-gray-200">
		<AppHeader>
			{#snippet left()}
				<Button onclick={goBack}>Back</Button>
			{/snippet}
			{#snippet center()}{/snippet}
			{#snippet right()}{/snippet}
		</AppHeader>
		<div
			class="page-content mx-auto flex w-full min-w-80 flex-col items-center gap-4 overflow-y-scroll p-4"
		>
			<div class="grid gap-4">
				<!-- TODO:UX avatar only seems to update after navigation or refresh... -->
				<AvatarEditor
					user={$authState.user}
					onAvatarChange={(avatar_url) => {
						if ($authState.status !== 'signed-in') return;
						console.log(
							avatar_url,
							$authState.user.avatar_url,
							avatar_url !== $authState.user.avatar_url
						);

						if (avatar_url !== $authState.user.avatar_url) {
							void debouncedUpdateUser({ update: { id: $authState.user.id, avatar_url } });
						}
					}}
					class="m-auto max-h-[50vh] max-w-[50vw]"
				/>
				<span class="flex flex-col">
					<label for="input_display_name" class="mb-2 font-medium text-gray-800">Name</label>
					<input
						id="input_display_name"
						type="text"
						bind:value={draftName}
						oninput={(event) => {
							event.preventDefault();
							if ($authState.status !== 'signed-in') return;
							if (event.currentTarget.value !== $authState.user.display_name) {
								void debouncedUpdateUser({
									update: { id: $authState.user.id, display_name: event.currentTarget.value }
								});
							}
						}}
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

			<Button class="alert" onclick={authAPI.logout}>Sign out</Button>

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
			<div class="m-2 border-t border-gray-300 p-2">
				<UserSettings />
			</div>
		</div>
		<AppFooter />
	</div>
{/if}
