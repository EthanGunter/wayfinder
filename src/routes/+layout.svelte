<script lang="ts">
	import { TooltipProvider } from '@/components/ui/tooltip';
	import '../app.css';

	const { children } = $props();

	//TODO Implement handlers for Browser/Android back buttons,
	// as well as state change handlers for when the app gets focused/goes into the backgroud
</script>

<div class="absolute top-0 left-0 h-screen w-screen">
	{@render children?.()}
</div>
