<script lang="ts">
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import type { Snippet } from 'svelte';

	type Props = { children?: Snippet };
	const { children }: Props = $props();
</script>

<Toaster position="top-center" />

<div class="page-root">
	{@render children?.()}
</div>
