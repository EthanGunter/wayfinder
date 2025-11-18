<script>
	import AppHeader from '$lib/components/AppHeader.svelte';

	const { children } = $props();
</script>

<AppHeader />
{@render children?.()}
