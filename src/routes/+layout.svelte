<script lang="ts">
	import '../app.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import type { Snippet } from 'svelte';
	import ModalHost from '$lib/components/ui/inline-modals/ModalProvider.svelte';

	type Props = { children?: Snippet };
	const { children }: Props = $props();
</script>


<div class="page-root">
	{@render children?.()}
</div>

<Toaster position="top-center" />
<ModalHost />