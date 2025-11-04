<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import Icon from '@iconify/svelte';

	let {
		groups
	}: {
		groups: {
			header: string;
			items: {
				title: string;
				url: string;
				icon?: string;
				isActive?: boolean;
				items?: {
					title: string;
					url: string;
				}[];
			}[];
		}[];
	} = $props();
</script>

<Sidebar.Group>
	{#each groups as group (group.header)}
		<Sidebar.GroupLabel>{group.header}</Sidebar.GroupLabel>
		{#each group.items as item (item.title)}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={item.title} isActive={item.isActive}>
						{#snippet child({ props })}
							<a href={item.url} {...props}>
								{#if item.icon}
									<Icon icon={item.icon} />
								{/if}
								<span>{item.title}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{/each}
	{/each}
</Sidebar.Group>
