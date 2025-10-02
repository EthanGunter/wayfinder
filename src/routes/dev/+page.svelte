<script lang="ts">
	import AppHeader from '@/components/AppHeader.svelte';
	import AppFooter from '@/components/AppFooter.svelte';
	import UserSettings from '@/user-settings/UserSettings.svelte';
	import { settings } from '@/user-settings/config';

	const secretCode = settings.dev.overrides.envVars.get('a');
</script>

<div class="graph-root page page-root">
	<AppHeader />
	{#if $secretCode === 'b'}
		<h1>Congratulations, you found the secret code!</h1>
	{:else}
		<UserSettings />
	{/if}
	<AppFooter />
</div>
