<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { User, StoredUser } from '$lib/API/Auth/types';

	// Svelte 5 state
	const { data } = $props();
	const user = data.user;
	let isEditing = $state(false);
	let showCreateAccount = $state(false);
	let isSaving = $state(false);

	// Form states
	let editedUser = $state<Partial<User>>(data.user);
	let newAccountData = $state({
		displayName: '',
		email: '',
		pin: ''
	});

	async function handleSignOut() {
		try {
			// Import dynamically to avoid circular dependencies
			const { default: SupabaseAuth } = await import('$lib/API/Auth/SupabaseAuth');
			const auth = new SupabaseAuth();
			await auth.signOut({ signOutSelf: true, signOutOthers: false });
			goto('/');
		} catch (error) {
			console.error('Sign out failed:', error);
		}
	}

	async function handleSave() {
		isSaving = true;
		try {
			// TODO: Implement user update API
			console.log('Saving user data:', editedUser);
			// For now, just update the local state
			isEditing = false;
		} catch (error) {
			console.error('Save failed:', error);
		} finally {
			isSaving = false;
		}
	}

	async function handleCreateAccount() {
		try {
			const { default: SupabaseAuth } = await import('$lib/API/Auth/SupabaseAuth');
			const auth = new SupabaseAuth();

			await auth.signUp({
				type: 'local',
				pin: newAccountData.pin,
				username: newAccountData.displayName
			});

			// Refresh user data
			invalidateAll();
			showCreateAccount = false;
			newAccountData = { displayName: '', email: '', pin: '' };
		} catch (error) {
			console.error('Account creation failed:', error);
		}
	}

	function handleUpgradeToSync() {
		// Navigate to upgrade page for proper migration flow
		goto('/account/upgrade');
	}

	function isLocalUser(user: User | null): user is StoredUser {
		return user !== null && 'isSynced' in user;
	}
</script>

<div class="account-page">
	{#if user}
		<div class="account-container">
			<header class="account-header">
				<h1>Account Settings</h1>
				{#if isLocalUser(user) && !user.is_synced}
					<span class="badge local">Local Account</span>
				{:else}
					<span class="badge synced">Synced Account</span>
				{/if}
			</header>

			<div class="user-info">
				<div class="avatar-section">
					<div class="avatar">
						{#if user.avatar_url}
							<img src={user.avatar_url} alt="User avatar" />
						{:else}
							<div class="avatar-placeholder">
								{user.display_name?.charAt(0)?.toUpperCase() || '?'}
							</div>
						{/if}
					</div>
					{#if isEditing}
						<button class="btn-secondary" onclick={() => console.log('Change avatar')}>
							Change Avatar
						</button>
					{/if}
				</div>

				<div class="info-section">
					{#if !isEditing}
						<div class="info-display">
							<div class="info-item">
								<label>Display Name</label>
								<p>{user.display_name ?? 'Anonymous'}</p>
							</div>
							<div class="info-item">
								<label>User ID</label>
								<p class="mono">{user.id}</p>
							</div>
							<div class="info-item">
								<label>Account Type</label>
								<p>
									{isLocalUser(user) && !user.is_synced ? 'Local (Not synced)' : 'Cloud (Synced)'}
								</p>
							</div>
						</div>
						<button class="btn-primary" onclick={() => (isEditing = true)}> Edit Profile </button>
					{:else}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
						>
							<div class="form-group">
								<label for="displayName">Display Name</label>
								<input
									id="displayName"
									placeholder="Anonymous"
									type="text"
									bind:value={editedUser.display_name}
									required
								/>
							</div>
							<div class="form-actions">
								<button type="submit" class="btn-primary" disabled={isSaving}>
									{isSaving ? 'Saving...' : 'Save Changes'}
								</button>
								<button type="button" class="btn-secondary" onclick={() => (isEditing = false)}>
									Cancel
								</button>
							</div>
						</form>
					{/if}
				</div>
			</div>

			{#if isLocalUser(user) && !user.is_synced}
				<div class="upgrade-section">
					<h2>Upgrade to Cloud Sync</h2>
					<p>Sync your data across devices and enable premium features</p>
					<ul class="benefits">
						<li>✓ Access your data from any device</li>
						<li>✓ Automatic backups</li>
						<li>✓ Real-time synchronization</li>
						<li>✓ Priority support</li>
					</ul>
					<button class="btn-upgrade" onclick={handleUpgradeToSync}> Upgrade to Cloud Sync </button>
				</div>
			{/if}

			<div class="danger-zone">
				<h3>Account Actions</h3>
				<button class="btn-danger" onclick={handleSignOut}> Sign Out </button>
			</div>
		</div>
	{:else}
		<div class="no-account">
			<h1>No Account Found</h1>
			<p>Create an account to get started</p>
			<button class="btn-primary" onclick={() => (showCreateAccount = true)}>
				Create Account
			</button>
		</div>
	{/if}

	{#if showCreateAccount}
		<div class="modal-overlay" onclick={() => (showCreateAccount = false)}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<h2>Create New Account</h2>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleCreateAccount();
					}}
				>
					<div class="form-group">
						<label for="newDisplayName">Display Name</label>
						<input
							id="newDisplayName"
							type="text"
							bind:value={newAccountData.displayName}
							required
						/>
					</div>
					<div class="form-group">
						<label for="newEmail">Email (Optional)</label>
						<input
							id="newEmail"
							type="email"
							bind:value={newAccountData.email}
							placeholder="For account recovery"
						/>
					</div>
					<div class="form-group">
						<label for="newPin">PIN</label>
						<input
							id="newPin"
							type="password"
							bind:value={newAccountData.pin}
							pattern="[0-9]"
							placeholder="4-6 digit PIN"
							required
						/>
					</div>
					<div class="form-actions">
						<button type="submit" class="btn-primary">Create Account</button>
						<button type="button" class="btn-secondary" onclick={() => (showCreateAccount = false)}>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.account-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
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

	.avatar-section {
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
		margin: 2rem 0;
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
