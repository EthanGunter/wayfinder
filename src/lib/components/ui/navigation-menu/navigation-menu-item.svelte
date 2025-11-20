<script lang="ts">
	import { NavigationMenu as NavigationMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		isSelected = () => false,
		...restProps
	}: NavigationMenuPrimitive.ItemProps & {
		isSelected?: () => boolean;
	} = $props();

	let selected = $derived(isSelected());
</script>

<NavigationMenuPrimitive.Item
	bind:ref
	data-slot="navigation-menu-item"
	class={cn('relative', selected && 'selected', className)}
	{...restProps}
/>

<style>
	:global(.selected) {
		border-bottom: 2px solid #0001;
	}
</style>
