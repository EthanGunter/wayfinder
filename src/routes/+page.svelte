<script lang="ts">
	import { goto } from '$app/navigation';
	import { redirect } from '@sveltejs/kit';

	console.log('[TODO:debug EG] root +page.svelte running, calling goto(/home)'); // TODO:debug EG
	goto('/home');
</script>
