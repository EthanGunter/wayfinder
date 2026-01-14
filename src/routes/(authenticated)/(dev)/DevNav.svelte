<script lang="ts">
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { page } from '$app/state';
	import { devEnabled } from '$lib/user-settings';
	import { Separator } from '$lib/components/ui/separator';

	type DevLink = { href: string; label: string };

	const links: DevLink[] = [{ href: '/skill-sprint', label: 'Skill Sprint' }];

	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

{#if $devEnabled}
	<Separator orientation="vertical" />
	{#each links as link (link.href)}
		<NavigationMenu.Item>
			<NavigationMenu.Link active={isActive(link.href)} href={link.href}>
				{link.label}
			</NavigationMenu.Link>
		</NavigationMenu.Item>
	{/each}
{/if}
