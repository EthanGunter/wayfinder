<script lang="ts">
	import { goto } from '$app/navigation';
	import { type SignInCredentials, AccountIssueTarget } from '$lib/API/Auth/types.js';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import TooltipHover from '$lib/components/overlays/TooltipHover.svelte';
	import { NotImplementedError } from '$lib/Errors.js';

	// Svelte 5 state
	const { data } = $props();
	const user = $state(data.user);
	let cred = $state<SignInCredentials>({
		type: 'email_password',
		email: '',
		password: ''
	});
	let accountIssues = $state<Map<AccountIssueTarget, Set<string>>>(new Map());

	$effect(() => {
		if (user && user.is_synced) goto('/account');
		// TODO Should probably provide a banner or alternative UI later
	});
	$effect(() => {
		checkAccountIssues();
	});

	async function checkAccountIssues() {
		const uiIssues = new Map();
		data.authAPI.getMigrationNeeds(cred).match(
			(issues) => {
				for (const issue of issues) {
					if (uiIssues.has(issue.target)) {
						uiIssues.get(issue.target)!.add(issue.message);
					} else {
						uiIssues.set(issue.target, new Set([issue.message]));
					}
				}
				accountIssues = uiIssues;
			},
			(err) => {
				// Should never happen
				err.logError(); // TODO Dev only
			}
		);
	}

	async function handleMigration() {
		if (!user || user.is_synced) {
			throw new Error('Invalid user for migration');
		}
		const uiIssues = new Map();
		const migRes = await data.authAPI.migrate(user, cred);
		if (migRes.isErr()) {
			if (migRes.error instanceof NotImplementedError) {
				// Should never happen
				migRes.error.logError(); // TODO Dev only
			} else {
				for (const err of migRes.error) {
					if (uiIssues.has(err.target)) {
						uiIssues.get(err.target)!.add(err.message);
					} else {
						uiIssues.set(err.target, new Set(err.message));
					}
				}
				accountIssues = uiIssues;
				return;
			}
		}
	}
</script>

<div id="upgrade-page" class="page">
	<AppHeader {user} />
	{#if user && !user.is_synced}
		<div class="content">
			{#if accountIssues.size > 0}
				<h2>You're almost there!</h2>
				<p>Just a few things to make your local account sync-ready</p>
			{:else}
				<h2>Your Account is Ready!</h2>
				<p>Your local account is ready to be upgraded to cloud sync.</p>
			{/if}

			<div class="issues-section">
				<h2>Before You Upgrade</h2>
				<p>Make sure everthing looks correct</p>
				<section id="sec-avatar">
					<!-- <div class="avatar">
						{#if user.avatar_url}
							<img src={user.avatar_url} alt="User avatar" />
						{:else}
							<div class="avatar-placeholder">
								{user.display_name?.charAt(0)?.toUpperCase() || '?'}
							</div>
						{/if}
					</div> -->
					<span>
						<label for="input_avatar_url">Avatar URL</label>
						<input id="input_avatar_url" type="text" bind:value={user.avatar_url} />
					</span>
				</section>
				<section id="sec-name">
					<label for="input_display_name">Name</label>
					<input id="input_display_name" type="text" bind:value={user.display_name} />
				</section>
				<section id="sec-email">
					<label for="input_email">Email</label>
					<input
						id="input_email"
						type="text"
						bind:value={cred.email}
						class:input-error={accountIssues.has(AccountIssueTarget.email)}
					/>
					{#if accountIssues.has(AccountIssueTarget.email)}
						<TooltipHover forElement="#input_email" delay={0} position="bottom">
							{#each accountIssues.get(AccountIssueTarget.email)! as emailIssue}
								- {emailIssue}
							{/each}
						</TooltipHover>
					{/if}
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
			</div>
			<div class="ready-section">
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
					<button class="btn-secondary" onclick={() => goto('/account')}> Maybe Later </button>
					<button class="btn-upgrade" onclick={handleMigration}> Start Upgrade </button>
				</div>
			</div>
		</div>
	{/if}
	<AppFooter />
</div>

<style>
	.input-error {
		background-color: #ffa5a5;
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
</style>
