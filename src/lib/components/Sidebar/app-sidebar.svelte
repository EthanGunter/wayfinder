<script lang="ts">
	import { page } from '$app/stores';
	import { authState } from '$lib/API/Auth';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';
	import type { ComponentProps } from 'svelte';
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import NavMain from './nav-main.svelte';
	import NavUser from './nav-user.svelte';
	import Separator from '../ui/separator/separator.svelte';
	import { devEnabled } from '$lib/user-settings';

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	let sidebar: ReturnType<typeof Sidebar.useSidebar> | null = $state(null);

	onMount(() => {
		sidebar = Sidebar.useSidebar();
		sidebar.setOpen(false);
		// TODO:BUG mobile doesn't have access to the sidebar. It's always closed...
		sidebar.setOpenMobile(false);

		let cleanup: (() => void) | undefined;

		// Wait for DOM to be ready, then set up handlers
		tick().then(() => {
			// Find the sidebar inner container element
			const sidebarElement = document.querySelector('[data-sidebar="sidebar"]') as HTMLElement;
			if (!sidebarElement) {
				console.warn('Sidebar element not found for click handlers');
				return;
			}

			// Handle clicking on collapsed sidebar to open it
			function handleSidebarClick(e: MouseEvent) {
				if (!sidebar || sidebar.isMobile) return;

				// Only handle clicks when collapsed
				if (sidebar.state !== 'collapsed') return;

				const target = e.target as HTMLElement;

				// Don't open if clicking on interactive elements (buttons, links, etc.)
				if (
					target.closest('button') ||
					target.closest('a') ||
					target.closest('[role="button"]') ||
					target.closest('[data-sidebar="trigger"]') ||
					target.closest('[data-sidebar="rail"]')
				) {
					return;
				}

				// Open the sidebar
				sidebar.setOpen(true);
			}

			// Close sidebar when clicking outside
			function handleClickOutside(e: MouseEvent) {
				if (!sidebar || sidebar.isMobile) return;

				const target = e.target as HTMLElement;

				// Don't close if clicking inside sidebar or on the trigger
				if (sidebarElement?.contains(target)) return;
				if (target.closest('[data-sidebar="trigger"]')) return;

				// Close if sidebar is open
				if (sidebar.open) {
					sidebar.setOpen(false);
				}
			}

			// Add click handlers
			sidebarElement.addEventListener('click', handleSidebarClick);
			document.addEventListener('click', handleClickOutside, true);

			cleanup = () => {
				sidebarElement.removeEventListener('click', handleSidebarClick);
				document.removeEventListener('click', handleClickOutside, true);
			};
		});

		return () => {
			cleanup?.();
		};
	});

	let sidebarItems = [
		{
			header: 'Navigation',
			items: [
				{
					title: 'Planner',
					url: '/planner',
					icon: 'pajamas:todo-done',
					isActive: $page.url.pathname.startsWith('/planner'),
					items: []
				},
				{
					title: 'Graph',
					url: '/graph',
					icon: 'ph:graph',
					isActive: $page.url.pathname.startsWith('/graph'),
					items: []
				}
			]
		}
	];

	let user = $derived($authState.status === 'signed-in' ? $authState.user : null);

	// Google Forms URLs
	const FORMS = {
		bug: 'https://docs.google.com/forms/d/e/1FAIpQLSfG_C9I54vHhHgFM0xF2Je9fUgEGvmPDceNhSwOI_3oGU8SdA/viewform?usp=sf_link',
		feature:
			'https://docs.google.com/forms/d/e/1FAIpQLScP4Yz3kHHbCFVR4ogsTSB9_XJ_rVGPNuQcS71T4LsV0lSsmw/viewform?usp=sf_link'
	};

	let feedbackSheetOpen = $state(false);
	// let previousPathname = $state($page.url.pathname);

	// Close sidebar on navigation (watch page store)
	/* 	$effect(() => {
		const currentPathname = $page.url.pathname;
		if (currentPathname !== previousPathname && sidebar) {
			if (sidebar.isMobile) {
				sidebar.setOpenMobile(false);
			} else {
				sidebar.setOpen(false);
			}
			previousPathname = currentPathname;
		}
	}); */
</script>

<Sidebar.Root {collapsible} {...restProps} variant="sidebar" class="border-border">
	<Sidebar.Header class="h-[var(--header-height)] group-data-[collapsible=icon]:justify-center">
		<div
			class="flex aspect-square h-full w-full items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
		>
			<div class="flex aspect-square items-center gap-2 group-data-[collapsible=icon]:gap-0">
				<img
					src="/images/android-chrome-192x192.png"
					alt="Wayfinder"
					class="h-7 w-7 flex-shrink-0 group-data-[collapsible=icon]:mx-auto"
				/>
				<span class="font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
					Wayfinder
				</span>
			</div>
		</div>
	</Sidebar.Header>
	<Separator />
	<Sidebar.Content>
		<NavMain groups={sidebarItems} />

		<!-- Feedback moved to content area -->
		<Sidebar.Group class="mt-auto">
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sheet.Root bind:open={feedbackSheetOpen}>
						<Sheet.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton tooltipContent="Help & Feedback" {...props}>
									<Icon icon="material-symbols:feedback-outline" class="size-5" />
									<span>Feedback</span>
								</Sidebar.MenuButton>
							{/snippet}
						</Sheet.Trigger>
						<Sheet.Content side="left" class="w-80">
							<Sheet.Header>
								<Sheet.Title>Help & Feedback</Sheet.Title>
								<Sheet.Description>
									Report bugs or suggest features to help improve Wayfinder
								</Sheet.Description>
							</Sheet.Header>

							<div class="mt-6 flex flex-col gap-4">
								<Button
									variant="outline"
									class="flex h-16 items-center justify-start gap-3"
									onclick={() => window.open(FORMS.bug, '_blank')}
								>
									<Icon icon="material-symbols:bug-report" class="size-6 text-red-600" />
									<div class="text-left">
										<div class="font-medium">Report a Bug</div>
										<div class="text-sm text-gray-500">Found something broken?</div>
									</div>
								</Button>

								<Button
									variant="outline"
									class="flex h-16 items-center justify-start gap-3"
									onclick={() => window.open(FORMS.feature, '_blank')}
								>
									<Icon icon="material-symbols:lightbulb" class="size-6 text-blue-600" />
									<div class="text-left">
										<div class="font-medium">Suggest a Feature</div>
										<div class="text-sm text-gray-500">Share your ideas</div>
									</div>
								</Button>
							</div>
						</Sheet.Content>
					</Sheet.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Group>
	</Sidebar.Content>
	{#if user}
		<Separator />
		<Sidebar.Footer>
			<NavUser {user} />
		</Sidebar.Footer>
	{/if}
	<Sidebar.Rail />
</Sidebar.Root>
