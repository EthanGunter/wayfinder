<script lang="ts">
	import Logo from './Logo.svelte';
	import InfoMenu from './ui/InfoMenu.svelte';
	import * as NavigationMenu from './ui/navigation-menu';
	import { Separator } from './ui/separator';
	import UserMenu from './ui/UserMenu.svelte';
	import { page } from '$app/state';

	type Props = {};
	const {}: Props = $props();
</script>

<div class="relative z-100 flex h-[var(--header-height)] w-full gap-3 bg-background shadow-sm">
	<Logo />
	<NavigationMenu.Root>
		<NavigationMenu.List>
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/planner'} href="/planner">
					Planner
				</NavigationMenu.Link>
			</NavigationMenu.Item>
			<Separator orientation="vertical" />
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/graph'} href="/graph">
					Graph
				</NavigationMenu.Link>
			</NavigationMenu.Item>
		</NavigationMenu.List>
	</NavigationMenu.Root>

	<!-- Push following content to the right -->
	<div class="flex-1"></div>

	<InfoMenu />
	<!-- <NotificationMenu /> -->
	<UserMenu />
</div>
