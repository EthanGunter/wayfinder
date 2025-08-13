<script lang="ts">
	import UserAvatar from '../../../lib/components/UserAvatar.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { userHasFeature, type LocalUser } from '$lib/API/Auth/User';

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
			await invalidateAll(); // TODO This may be unnecessary if onAuthChanged gets implemented
		}
	}

	function handleNameInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		event.preventDefault();
		// if (event.currentTarget.value === '') user.display_name = data.user.display_name;
	}
</script>

<div id="account-page" class="page">
	<AppHeader {user} authAPI={auth} />
	<div class="content">
		<!-- TODO Extract avatar to reusable component -->
		<div class="input-fields">
			<div class="avatar-field">
				<UserAvatar {user} />
				<span>
					<label for="input_avatar_url">Avatar URL</label>
					<input id="input_avatar_url" type="text" bind:value={user.avatar_url} />
				</span>
			</div>
			<span>
				<label for="input_display_name">Name</label>
				<input
					id="input_display_name"
					type="text"
					bind:value={user.display_name}
					oninput={handleNameInput}
					placeholder="Really cool username"
				/>
			</span>
			<!-- TODO Local Passkey <section id="sec-passkey">
				<button>Passkey</button>
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
			<button onclick={saveUserChanges}>Save Changes</button>
		{/if}
		{#if !userHasFeature(user, 'task-sync')}
			<div class="upgrade-section">
				<h2>Upgrade to Cloud Sync</h2>
				<p>Sync your data across devices and enable premium features</p>
				<ul class="benefits">
					<li>✓ Access your data from any device</li>
					<li>✓ Automatic backups</li>
					<li>✓ Real-time synchronization</li>
					<li>✓ Priority support</li>
				</ul>
				<button
					class="btn-upgrade"
					onclick={async () => {
						await saveUserChanges();
						goto('/account/upgrade');
					}}
				>
					Upgrade to Cloud Sync
				</button>
			</div>
		{/if}
		<!-- TODO Add no-account login page <button class="alert" onclick={auth.signOut}>Sign out</button> -->
	</div>
	<AppFooter />
</div>

<style>
	.input-fields {
		display: grid;
		gap: 1rem;
		min-width: 70%;

		span {
			display: flex;
			flex-direction: column;
		}

		.avatar-field {
			:global(.user-avatar) {
				margin: 1rem auto;
				max-width: 10rem;
			}
		}
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		gap: 1rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #f3f3f3;
		border-top: 3px solid #3498db;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.btn-upgrade {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-upgrade {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		font-size: 1.125rem;
		padding: 1rem 2rem;
	}

	.btn-upgrade:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
	}

	.upgrade-section {
		background: #f8f9fa;
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
	}

	.upgrade-section h2 {
		margin: 0 0 0.5rem 0;
		color: #333;
	}

	.upgrade-section p {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.benefits {
		list-style: none;
		padding: 0;
		margin: 0 0 2rem 0;
		text-align: left;
		max-width: 300px;
		margin-left: auto;
		margin-right: auto;
	}

	.benefits li {
		padding: 0.5rem 0;
		color: #333;
	}
</style>
