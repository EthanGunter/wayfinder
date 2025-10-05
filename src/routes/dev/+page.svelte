<script lang="ts">
	import AppHeader from '@/components/AppHeader.svelte';
	import AppFooter from '@/components/AppFooter.svelte';
	import UserSettings from '@/user-settings/UserSettings.svelte';
	import { settings } from '@/user-settings/config';
</script>

<div class="graph-root page page-root">
	<AppHeader />
	<UserSettings />
	<AppFooter />
</div>
