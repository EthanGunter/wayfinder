<script lang="ts">
	import AvatarEditor from '../../lib/components/AvatarEditor.svelte';

	import { goto, invalidateAll } from '$app/navigation';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { userHasFeature, type LocalUser, type User } from '$lib/API/Auth/User';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { page } from '$app/state';
	import { Button } from '@/components/ui/button';
	import { authAPIPromise } from '@/stores/services';
	import { onMount } from 'svelte';
	import { type ILocalAuth } from '@/API/Auth/types';
	import { redirect } from '@sveltejs/kit';

	let originalUser = $state<User>();
	let user = $state<User>();
	let auth = $state<ILocalAuth>();

	const debouncedUpdateUser = $derived(auth ? debounce(auth.updateUser, 200) : undefined);

	onMount(async () => {
		auth = await authAPIPromise;
		const active = await auth.getActiveUser();
		if (!active) {
			goto(`/login?redirect=${page.url.pathname}${page.url.search}`);
			return;
		}
		user = active;
		originalUser = { ...user };
	});

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
			await invalidateAll(); // TODO This may be unnecessary if onAuthChanged gets implemented
		}
	}

	function handleNameInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		event.preventDefault();
		// if (event.currentTarget.value === '') user.display_name = data.user.display_name;
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
			class="grid-area-content mx-auto flex w-full max-w-[25rem] min-w-80 flex-col justify-center items-center gap-4 overflow-y-scroll p-4"
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
