<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { userHasFeature, type LocalUser } from '$lib/API/Auth/User';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { page } from '$app/state';
	import { Button } from '@/components/ui/button';

	// Svelte 5 state
	const { data } = $props();
	const auth = data.auth;
	let user = $state(data.user);
	const debouncedUpdateUser = debounce(auth.updateUser, 200);

	function equals(a: LocalUser, b: LocalUser) {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	async function saveUserChanges() {
		// Only pass the fields that actually changed, not the entire user object
		const changedFields: Partial<LocalUser> = {};

		if (user.display_name !== data.user.display_name) {
			changedFields.display_name = user.display_name;
		}
		if (user.avatar_url !== data.user.avatar_url) {
			changedFields.avatar_url = user.avatar_url;
		}

		// Only update if there are actual changes
		if (Object.keys(changedFields).length > 0) {
			await debouncedUpdateUser({
				update: {
					id: user.id,
					...changedFields
				}
			});
			await auth.updateUser({ update: { ...changedFields, id: user.id } });
			await invalidateAll(); // TODO This may be unnecessary if onAuthChanged gets implemented
		}
	}

	function handleNameInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		event.preventDefault();
		// if (event.currentTarget.value === '') user.display_name = data.user.display_name;
	}
	function goBAck() {
		const redirect = page.url.searchParams.get('redirect');
		if (redirect) {
			goto(redirect);
		} else {
			goto('/');
		}
	}
</script>

<div id="account-page" class="relative w-full h-full bg-gray-200 grid grid-rows-[auto_1fr_auto] grid-areas-[header_content_footer]">
	<AppHeader {user} authAPI={auth}>
		{#snippet left()}
			<Button onclick={goBAck}>Back</Button>
		{/snippet}
	</AppHeader>
	<div class="grid-area-content flex flex-col w-full min-w-80 max-w-[35rem] mx-auto p-4 items-center overflow-y-scroll gap-4">
		<!-- TODO Extract avatar to reusable component -->
		<div class="grid gap-4 min-w-[70%]">
			<div class="flex flex-col items-center">
				<div class="m-4 max-w-40">
					<UserAvatar {user} />
				</div>
				<span class="flex flex-col">
					<label for="input_avatar_url" class="mb-2 text-gray-800 font-medium">Avatar URL</label>
					<input id="input_avatar_url" type="text" bind:value={user.avatar_url} class="p-2 border border-gray-300 rounded" />
				</span>
			</div>
			<span class="flex flex-col">
				<label for="input_display_name" class="mb-2 text-gray-800 font-medium">Name</label>
				<input
					id="input_display_name"
					type="text"
					bind:value={user.display_name}
					oninput={handleNameInput}
					placeholder="Really cool username"
					class="p-2 border border-gray-300 rounded"
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
		{#if !equals(user, data.user)}
			<Button onclick={saveUserChanges}>Save Changes</Button>
		{/if}
		{#if !userHasFeature(user, 'task-sync')}
			<div class="bg-gray-50 rounded-lg p-8 text-center">
				<h2 class="m-0 mb-2 text-gray-800">Upgrade to Cloud Sync</h2>
				<p class="text-gray-600 mb-6">Sync your data across devices and enable premium features</p>
				<ul class="list-none p-0 m-0 text-left max-w-xs mx-auto mb-8">
					<li class="py-2 text-gray-800">✓ Access your data from any device</li>
					<li class="py-2 text-gray-800">✓ Automatic backups</li>
					<li class="py-2 text-gray-800">✓ Real-time synchronization</li>
					<li class="py-2 text-gray-800">✓ Priority support</li>
				</ul>
				<Button
					class="bg-gradient-to-br from-blue-400 to-purple-600 text-white text-lg p-4 px-8 hover:-translate-y-1 hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)] transition-all duration-200"
					onclick={async () => {
						await saveUserChanges();
						goto('/account/upgrade');
					}}
				>
					Upgrade to Cloud Sync
				</Button>
			</div>
		{/if}
		<!-- TODO Add no-account login page <Button class="alert" onclick={auth.signOut}>Sign out</Button> -->
	</div>
	<AppFooter />
</div>
