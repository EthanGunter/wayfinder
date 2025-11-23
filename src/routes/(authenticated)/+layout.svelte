<script lang="ts">
	import { authState, authAPI } from '$lib/API/Auth';
	import Icon from '@iconify/svelte';
	import LoginView from '$lib/components/AuthComponents/Login.svelte';
	import { InputRequiredError, type Err } from '$domain/errors';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { Toaster } from '$lib/components/ui/sonner';

	const { children } = $props();
	let mode = $state</* 'select' | */ 'login' | 'register'>('login');
	let overlayOpen = $state(false);

	// Reactive effect that responds to auth state changes
	$effect(() => {
		const state = $authState;

		if (state.status === 'loading') {
		} else if (state.status === 'signed-in') {
			// TODO:optimization I think this happens entirely too often
			// User is authenticated - hydrate their data and allow access to app
			// tasksAPI.hydrateForUser({ user: state.user });
			// Auto-close overlay once we are signed in
			overlayOpen = false;
		} else if (state.status === 'error') {
			// TODO:UX Add error page
		} else if (state.status === 'signed-out') {
			// Decide initial mode on signed-out
			// mode = $cachedUsers.length > 0 ? 'select' : 'login';
			mode = 'login';
		}
	});

	// Keep one section open: if value becomes falsy, force fallback based on cached users
	$effect(() => {
		if (!mode) {
			// mode = $cachedUsers.length > 0 ? 'select' : 'login';
			mode = 'login';
		}
	});

	// Lightweight cross-app toggle for the auth overlay without navigation
	$effect.root(() => {
		function handleOpenAuth(event: CustomEvent<{ mode: /* 'select' | */ 'login' | 'register' }>) {
			// const next = event?.detail?.mode;
			// Coerce to 'login' since Register is now embedded inside Login
			mode = 'login';
			overlayOpen = true;
		}
		window.addEventListener('open-auth', handleOpenAuth as EventListener);
		return () => window.removeEventListener('open-auth', handleOpenAuth as EventListener);
	});
</script>

{#if $authState.status === 'loading'}
	<div class="flex h-screen w-full items-center justify-center">
		<Icon icon="lucide:loader-circle" class="size-10 animate-spin" />
	</div>
{:else if $authState.status === 'signed-out' || overlayOpen}
	<div class="page flex min-h-screen min-w-screen items-center justify-center p-4">
		<div
			class="relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-4 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"
		>
			<!-- Back Button -->
			<!-- 				<Button
					variant="ghost"
					class="absolute top-4 left-4 h-8 w-8 rounded-full p-0 opacity-70 transition-opacity hover:opacity-100"
					onclick={goBack}
				>
					<Icon icon="lucide:arrow-left" class="h-4 w-4" />
					<span class="sr-only">Back</span>
				</Button> -->

			<LoginView />

			<!-- 				<Accordion.Root type="single" bind:value={mode}>
					{#if $cachedUsers.length > 0}
						<Accordion.Item value="select">
							<Accordion.Trigger
								class="transition-all data-[state=closed]:rounded-md data-[state=closed]:bg-muted/50 data-[state=closed]:px-3 data-[state=closed]:py-3 data-[state=open]:py-5 data-[state=open]:text-lg data-[state=open]:font-semibold"
								>Choose an account</Accordion.Trigger
							>
							<Accordion.Content>
								<SelectUserView onError={setErrorMessage} />
							</Accordion.Content>
						</Accordion.Item>
					{/if}

					<Accordion.Item value="login">
						<Accordion.Trigger
							class="transition-all data-[state=closed]:rounded-md data-[state=closed]:bg-muted/50 data-[state=closed]:px-3 data-[state=closed]:py-3 data-[state=open]:py-5 data-[state=open]:text-lg data-[state=open]:font-semibold"
							>Sign in</Accordion.Trigger
						>
						<Accordion.Content>
							<LoginView onError={setErrorMessage} />
						</Accordion.Content>
					</Accordion.Item>
				</Accordion.Root> -->
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}
