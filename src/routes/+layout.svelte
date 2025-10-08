<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from 'convex-svelte';
	import '../app.css';

	const { children } = $props();

	// setupConvex(PUBLIC_CONVEX_URL);
</script>

<div class="absolute top-0 left-0 h-screen w-screen">
	{@render children?.()}
</div>
