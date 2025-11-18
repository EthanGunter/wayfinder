<script lang="ts">
	import { NavigationMenu as NavigationMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: NavigationMenuPrimitive.LinkProps = $props();
	let active = $derived(restProps.active);
</script>

<NavigationMenuPrimitive.Link
	bind:ref
	data-slot="navigation-menu-link"
	class={cn(
		"m-1 flex flex-col gap-1 p-1 text-sm text-muted-foreground transition-all outline-none hover:text-accent-foreground  focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
		active && 'border-b-4 border-b-[#0002] text-foreground',
		className
	)}
	{...restProps}
/>
