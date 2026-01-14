<script>
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Input from '$lib/components/ui/input/input.svelte';

	const { children } = $props();
</script>

<AppHeader />
{@render children?.()}
