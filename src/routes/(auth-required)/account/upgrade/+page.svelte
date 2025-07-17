<script lang="ts">
	import { goto } from '$app/navigation';
	import type { StoredUser } from '$lib/API/Auth/types';

	// Svelte 5 state
	const { data } = $props();
	const user = data.user;
	let accountIssues = $state<string[]>([]);
	let isChecking = $state(true);
	let isMigrating = $state(false);
	let migrationProgress = $state(0);
	let migrationStatus = $state('');

	// Form state for resolving issues
	let emailForRecovery = $state('');
	let password = $state('');
	let confirmPassword = $state('');

	$effect(() => {
		checkAccountIssues();
	});

	async function checkAccountIssues() {
		isChecking = true;
		try {
			// TODO: Implement actual migration provider check
			const issues: string[] = [];

			accountIssues = issues;
		} catch (error) {
			console.error('Failed to check account issues:', error);
		} finally {
			isChecking = false;
		}
	}

	async function handleMigration() {
		isMigrating = true;
		migrationProgress = 0;

		try {
			if (!user || user.is_synced) {
				throw new Error('Invalid user for migration');
			}

			// Simulate migration steps
			const steps = [
				{ progress: 20, status: 'Creating cloud account...' },
				{ progress: 40, status: 'Encrypting local data...' },
				{ progress: 60, status: 'Uploading tasks and projects...' },
				{ progress: 80, status: 'Verifying data integrity...' },
				{ progress: 100, status: 'Migration complete!' }
			];

			for (const step of steps) {
				migrationStatus = step.status;
				migrationProgress = step.progress;
				await new Promise((resolve) => setTimeout(resolve, 1500));
			}

			// TODO: Implement actual migration using IMigrationProvider
			console.log('Migration completed successfully');

			// Redirect to account page after successful migration
			setTimeout(() => goto('/account'), 2000);
		} catch (error) {
			console.error('Migration failed:', error);
			migrationStatus = 'Migration failed. Please try again.';
			isMigrating = false;
		}
	}

	function handleResolveIssues() {
		// TODO: Implement issue resolution
		// For now, just clear the issues if email is provided
		if (emailForRecovery && password === confirmPassword) {
			accountIssues = [];
		}
	}
</script>

<div class="upgrade-page">
	{#if user && !user.is_synced}
		<div class="upgrade-container">
			<header class="upgrade-header">
				<h1>Upgrade to Cloud Sync</h1>
				<p class="subtitle">Transform your local account into a powerful cloud-synced account</p>
			</header>

			{#if isChecking}
				<div class="checking">
					<div class="spinner"></div>
					<p>Checking account readiness...</p>
				</div>
			{:else if accountIssues.length > 0}
				<div class="issues-section">
					<h2>Before You Upgrade</h2>
					<p>Please resolve the following issues to ensure a smooth migration:</p>

					<div class="issues-list">
						{#each accountIssues as issue}
							<div class="issue-item">
								<span class="issue-icon">⚠️</span>
								<span>{issue}</span>
							</div>
						{/each}
					</div>

					<form
						class="resolve-form"
						onsubmit={(e) => {
							e.preventDefault();
							handleResolveIssues();
						}}
					>
						<h3>Resolve Issues</h3>

						{#if accountIssues.includes('No email address for account recovery')}
							<div class="form-group">
								<label for="email">Email Address</label>
								<input
									id="email"
									type="email"
									bind:value={emailForRecovery}
									placeholder="your@email.com"
									required
								/>
								<small>Used for account recovery and notifications</small>
							</div>

							<div class="form-group">
								<label for="password">Create Password</label>
								<input
									id="password"
									type="password"
									bind:value={password}
									placeholder="Strong password"
									required
								/>
							</div>

							<div class="form-group">
								<label for="confirmPassword">Confirm Password</label>
								<input
									id="confirmPassword"
									type="password"
									bind:value={confirmPassword}
									placeholder="Confirm password"
									required
								/>
							</div>
						{/if}

						<button type="submit" class="btn-primary"> Save and Continue </button>
					</form>
				</div>
			{:else if !isMigrating}
				<div class="ready-section">
					<div class="success-icon">✅</div>
					<h2>Your Account is Ready!</h2>
					<p>Your local account is ready to be upgraded to cloud sync.</p>

					<div class="features">
						<h3>What You'll Get:</h3>
						<div class="feature-grid">
							<div class="feature">
								<span class="feature-icon">☁️</span>
								<h4>Cloud Storage</h4>
								<p>All your data safely stored in the cloud</p>
							</div>
							<div class="feature">
								<span class="feature-icon">🔄</span>
								<h4>Real-time Sync</h4>
								<p>Access your data from any device instantly</p>
							</div>
							<div class="feature">
								<span class="feature-icon">🔒</span>
								<h4>Enhanced Security</h4>
								<p>End-to-end encryption for your data</p>
							</div>
							<div class="feature">
								<span class="feature-icon">💾</span>
								<h4>Automatic Backups</h4>
								<p>Never lose your data again</p>
							</div>
						</div>
					</div>

					<div class="pricing">
						<h3>Pricing</h3>
						<div class="price-card">
							<div class="price">$4.99/month</div>
							<p>or $49.99/year (save 17%)</p>
							<ul>
								<li>Unlimited cloud storage</li>
								<li>Sync across unlimited devices</li>
								<li>Priority support</li>
								<li>Advanced features</li>
							</ul>
						</div>
					</div>

					<div class="action-buttons">
						<button class="btn-upgrade" onclick={handleMigration}> Start Upgrade </button>
						<button class="btn-secondary" onclick={() => goto('/account')}> Maybe Later </button>
					</div>
				</div>
			{:else}
				<div class="migration-section">
					<h2>Upgrading Your Account</h2>
					<p class="migration-status">{migrationStatus}</p>

					<div class="progress-bar">
						<div class="progress-fill" style="width: {migrationProgress}%"></div>
					</div>
					<p class="progress-text">{migrationProgress}%</p>

					{#if migrationProgress === 100}
						<div class="success-message">
							<span class="success-icon">🎉</span>
							<h3>Upgrade Complete!</h3>
							<p>Your account has been successfully upgraded to cloud sync.</p>
							<p>Redirecting to your account page...</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else if user && user.is_synced}
		<div class="already-upgraded">
			<h1>Already Upgraded!</h1>
			<p>Your account is already using cloud sync.</p>
			<button class="btn-primary" onclick={() => goto('/account')}> Back to Account </button>
		</div>
	{:else}
		<div class="error">
			<h2>Invalid Account</h2>
			<p>This upgrade is only available for local accounts.</p>
			<button class="btn-primary" onclick={() => goto('/account')}> Back to Account </button>
		</div>
	{/if}
</div>

<style>
	.upgrade-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	.loading,
	.checking {
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
		border-top: 3px solid #667eea;
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

	.upgrade-container {
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		padding: 2rem;
	}

	.upgrade-header {
		text-align: center;
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid #eee;
	}

	.upgrade-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle {
		color: #666;
		font-size: 1.125rem;
		margin: 0;
	}

	.issues-section {
		margin: 2rem 0;
	}

	.issues-section h2 {
		margin: 0 0 0.5rem 0;
		color: #333;
	}

	.issues-list {
		background: #fef3c7;
		border: 1px solid #fbbf24;
		border-radius: 8px;
		padding: 1rem;
		margin: 1rem 0 2rem 0;
	}

	.issue-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		color: #92400e;
	}

	.issue-icon {
		font-size: 1.25rem;
	}

	.resolve-form {
		background: #f8f9fa;
		border-radius: 8px;
		padding: 1.5rem;
		margin-top: 2rem;
	}

	.resolve-form h3 {
		margin: 0 0 1rem 0;
		color: #333;
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
		border-color: #667eea;
	}

	.form-group small {
		display: block;
		margin-top: 0.25rem;
		color: #666;
		font-size: 0.875rem;
	}

	.ready-section {
		text-align: center;
	}

	.success-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.ready-section h2 {
		margin: 0 0 0.5rem 0;
		color: #333;
	}

	.features {
		margin: 3rem 0;
		text-align: left;
	}

	.features h3 {
		text-align: center;
		margin-bottom: 2rem;
		color: #333;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 2rem;
	}

	.feature {
		text-align: center;
	}

	.feature-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 1rem;
	}

	.feature h4 {
		margin: 0 0 0.5rem 0;
		color: #333;
	}

	.feature p {
		margin: 0;
		color: #666;
		font-size: 0.875rem;
	}

	.pricing {
		margin: 3rem 0;
		text-align: center;
	}

	.pricing h3 {
		margin-bottom: 1.5rem;
		color: #333;
	}

	.price-card {
		background: #f8f9fa;
		border-radius: 12px;
		padding: 2rem;
		max-width: 400px;
		margin: 0 auto;
		border: 2px solid #667eea;
	}

	.price {
		font-size: 2.5rem;
		font-weight: bold;
		color: #667eea;
		margin-bottom: 0.5rem;
	}

	.price-card p {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.price-card ul {
		list-style: none;
		padding: 0;
		margin: 0;
		text-align: left;
	}

	.price-card li {
		padding: 0.5rem 0;
		color: #333;
	}

	.price-card li::before {
		content: '✓ ';
		color: #667eea;
		font-weight: bold;
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 2rem;
	}

	.btn-primary,
	.btn-secondary,
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

	.btn-primary:hover {
		background: #2980b9;
	}

	.btn-secondary {
		background: #e0e0e0;
		color: #333;
	}

	.btn-secondary:hover {
		background: #d0d0d0;
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

	.migration-section {
		text-align: center;
		padding: 2rem;
	}

	.migration-section h2 {
		margin: 0 0 1rem 0;
		color: #333;
	}

	.migration-status {
		color: #666;
		margin-bottom: 2rem;
		font-size: 1.125rem;
	}

	.progress-bar {
		width: 100%;
		height: 20px;
		background: #f0f0f0;
		border-radius: 10px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		transition: width 0.5s ease;
	}

	.progress-text {
		color: #666;
		font-size: 1.25rem;
		font-weight: bold;
	}

	.success-message {
		margin-top: 2rem;
		padding: 2rem;
		background: #d1fae5;
		border-radius: 8px;
		color: #065f46;
	}

	.success-message h3 {
		margin: 0.5rem 0;
		color: #065f46;
	}

	.already-upgraded,
	.error {
		text-align: center;
		padding: 4rem 2rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.already-upgraded h1 {
		margin: 0 0 1rem 0;
		color: #333;
	}

	.error {
		background: #fee;
	}

	.error h2 {
		margin: 0 0 1rem 0;
		color: #c00;
	}

	@media (max-width: 768px) {
		.upgrade-page {
			padding: 1rem;
		}

		.feature-grid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.action-buttons {
			flex-direction: column;
		}

		.btn-primary,
		.btn-secondary,
		.btn-upgrade {
			width: 100%;
		}
	}
</style>
