<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import Button from '$lib/components/ui/button/button.svelte';
	import remoteAuth from '$lib/API/Auth/ConvexAuthProvider';
	import { authkit } from '$lib/API/WorkOSAuthKit';

	let id = $state('');
	let user = $derived(remoteAuth.watchUser({ id }));
</script>

<h1>Convex test</h1>
<Button onclick={() => authkit.signIn()}>Login</Button>
{#if $user.status === 'loading'}
	loading...
{:else if $user.status === 'resolved'}
	{JSON.stringify($user.data)}
{/if}
<Button
	onclick={() =>
		remoteAuth.register({
			creds: { type: 'email_password', email: 'test@test.com', password: 'test' },
			userData: {
				id: 'test',
				displayName: 'Test User',
				avatarUrl: '',
				createdAt: new Date(),
				status: 'active',
				features: []
			}
		})}
>
	Build Test Users
</Button>
