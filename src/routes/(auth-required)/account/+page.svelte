<script lang="ts">
	import UserAvatar from '../../../lib/components/UserAvatar.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { StoredUser } from '$lib/API/Auth/types';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import debounce from '$lib/debounce';
	import { onMount } from 'svelte';

	// Svelte 5 state
	const { data } = $props();
	let user = $state(data.user);
	const debouncedUpdateUser = debounce(data.authAPI.updateUser, 200);

	onMount(() => {
		function handleAuthChange(newUser: StoredUser | null) {
			if (newUser) user = newUser;
			else throw new Error("Drawing account page with null user shouldn't be possible");
		}
		const unsubscribe = data.authAPI.onAuthStateChanged(handleAuthChange);
		return () => {
			unsubscribe();
		};
	});

	function equals(a: StoredUser, b: StoredUser) {
		return JSON.stringify(a) === JSON.stringify(b);
	}

	async function saveUserChanges() {
		await debouncedUpdateUser(user);
		await invalidateAll();
	}

	function handleNameInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		event.preventDefault();
		if (event.currentTarget.value === '') user.display_name = undefined;
	}
</script>

<div id="account-page" class="page">
	<AppHeader {user} />
	<div class="content">
		<!-- TODO Extract avatar to reusable component -->
		<section id="sec-avatar">
			<UserAvatar {user} />
			<span>
				<label for="input_avatar_url">Avatar URL</label>
				<input id="input_avatar_url" type="text" bind:value={user.avatar_url} />
			</span>
		</section>
		<section id="sec-name">
			<label for="input_display_name">Name</label>
			<input
				id="input_display_name"
				type="text"
				bind:value={user.display_name}
				oninput={handleNameInput}
			/>
		</section>
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
		{#if !equals(user, data.user)}
			<button onclick={saveUserChanges}>Save Changes</button>
		{/if}
		{#if !user.is_synced}
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
					onclick={() => {
						goto('/account/upgrade');
					}}
				>
					Upgrade to Cloud Sync
				</button>
			</div>
		{/if}
		<!-- TODO Add no-account login page <button class="alert" onclick={data.authAPI.signOut}>Sign out</button> -->
	</div>
	<AppFooter />
</div>

<style>
	.content {
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

	.account-container {
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		padding: 2rem;
	}

	.account-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #eee;
	}

	.account-header h1 {
		margin: 0;
		font-size: 2rem;
		color: #333;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.badge.local {
		background: #fef3c7;
		color: #92400e;
	}

	.badge.synced {
		background: #d1fae5;
		color: #065f46;
	}

	.user-info {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
	}

	#sec-avatar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.avatar {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		overflow: hidden;
		background: #f0f0f0;
	}

	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3rem;
		font-weight: bold;
		color: #666;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}

	.info-section {
		flex: 1;
	}

	.info-display {
		display: grid;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.info-item {
		display: grid;
		gap: 0.25rem;
	}

	.info-item label {
		font-size: 0.875rem;
		color: #666;
		font-weight: 500;
	}

	.info-item p {
		margin: 0;
		font-size: 1rem;
		color: #333;
	}

	.mono {
		font-family: monospace;
		font-size: 0.875rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: #333;
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	.form-group input:focus {
		outline: none;
		border-color: #3498db;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
	}

	.btn-primary,
	.btn-secondary,
	.btn-danger,
	.btn-upgrade {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary {
		background: #3498db;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #2980b9;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: #e0e0e0;
		color: #333;
	}

	.btn-secondary:hover {
		background: #d0d0d0;
	}

	.btn-danger {
		background: #e74c3c;
		color: white;
	}

	.btn-danger:hover {
		background: #c0392b;
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

	.danger-zone {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid #eee;
	}

	.danger-zone h3 {
		margin: 0 0 1rem 0;
		color: #666;
		font-size: 1.125rem;
	}

	.no-account {
		text-align: center;
		padding: 4rem 2rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.no-account h1 {
		margin: 0 0 1rem 0;
		color: #333;
	}

	.no-account p {
		color: #666;
		margin-bottom: 2rem;
	}

	.error {
		text-align: center;
		padding: 2rem;
		background: #fee;
		border-radius: 8px;
		color: #c00;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		max-width: 400px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: #333;
	}

	@media (max-width: 768px) {
		.account-page {
			padding: 1rem;
		}

		.user-info {
			grid-template-columns: 1fr;
			text-align: center;
		}

		.avatar-section {
			margin-bottom: 1rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.btn-primary,
		.btn-secondary,
		.btn-danger {
			width: 100%;
		}
	}
</style>
