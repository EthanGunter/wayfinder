<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		iconOnly?: boolean;
	} & HTMLAttributes<HTMLDivElement>;

	const { iconOnly = false, ...restProps }: Props = $props();
</script>

<div class="flex items-center gap-2 px-2" {...restProps}>
	<img src="/images/android-chrome-192x192.png" alt="Wayfinder" class="h-7 w-7 flex-shrink-0" />
	{#if !iconOnly}
		<span class="text-lg font-semibold hidden sm:block">
			Wayfinder <span class="text-xs text-muted-foreground">(alpha)</span>
		</span>
	{/if}
</div>
