<script lang="ts">
	import Logo from './Logo.svelte';
	import * as NavigationMenu from './ui/navigation-menu';
	import { Separator } from './ui/separator';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import UserMenu from './ui/UserMenu.svelte';
	import InfoMenu from './ui/InfoMenu.svelte';

	type Props = { children?: Snippet };
	const { children }: Props = $props();
</script>

<!-- TODO Too many items in the header breaks the content on narrow screens -->
<div class="relative z-100 flex h-[var(--header-height)] w-full gap-3 bg-background shadow-sm">
	<Logo />
	<NavigationMenu.Root class="flex w-full max-w-none sm:max-w-max">
		<NavigationMenu.List>
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/projects'} href="/projects">
					Projects
				</NavigationMenu.Link>
			</NavigationMenu.Item>
			<Separator orientation="vertical" />
			<NavigationMenu.Item>
				<NavigationMenu.Link active={page.url.pathname === '/planner'} href="/planner">
					Planner
				</NavigationMenu.Link>
			</NavigationMenu.Item>
		</NavigationMenu.List>
	</NavigationMenu.Root>

	<!-- Push following content to the right -->
	<div class="flex items-center sm:flex-1">
		{@render children?.()}
	</div>

	<div class="flex flex-shrink-0 items-center gap-1">
		<InfoMenu class="hidden sm:block" />
		<!-- <NotificationMenu /> -->
		<UserMenu />
	</div>
</div>
