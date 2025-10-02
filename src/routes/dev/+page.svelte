<script lang="ts">
	import AppHeader from '@/components/AppHeader.svelte';
	import AppFooter from '@/components/AppFooter.svelte';
	import UserSettings from '@/user-settings/UserSettings.svelte';
	import { settings } from '@/user-settings/config';

	const envVars = settings.dev.overrides.envVars;
	const envVarOverrides = settings.dev.overrides.envVars.asMap();
</script>

<div class="graph-root page page-root">
	<AppHeader />
	{#if $envVarOverrides.get('a') === 'b'}
		<h1>Congratulations, you found the secret code!</h1>
	{:else}
		<UserSettings />
	{/if}
	<AppFooter />
	{JSON.stringify($envVars)}
	{JSON.stringify(
		Array.from($envVarOverrides).map(([k, v]) => ({
			[k]: v
		}))
	)}
</div>
