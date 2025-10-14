<script lang="ts">
	import '../app.css';
	import { authState, cachedUsers, authAPI } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import Icon from '@iconify/svelte';
	import SelectUserView from '$lib/components/AuthComponents/SelectUser.svelte';
	import LoginView from '$lib/components/AuthComponents/Login.svelte';
	import RegisterView from '$lib/components/AuthComponents/Register.svelte';
	import { InputRequiredError, type Err } from '$domain/errors';
	import * as Accordion from '$lib/components/ui/accordion';

	const { children } = $props();
	let mode = $state<'select' | 'login' | 'register'>('login');
	let errorMessage = $state('');

	// Reactive effect that responds to auth state changes
	$effect(() => {
		const state = $authState;

		if (state.status === 'loading') {
		} else if (state.status === 'signed-in') {
			// TODO:optimization I think this happens entirely too often
			// User is authenticated - hydrate their data and allow access to app
			tasksAPI.hydrateForUser({ user: state.user });
		} else if (state.status === 'error') {
			// TODO:UX Add error page
		} else if (state.status === 'signed-out') {
			// Decide initial mode on signed-out
			mode = $cachedUsers.length > 0 ? 'select' : 'login';
		}
	});

	// Keep one section open: if value becomes falsy, force fallback based on cached users
	$effect(() => {
		if (!mode) {
			mode = $cachedUsers.length > 0 ? 'select' : 'login';
		}
	});

	async function setErrorMessage(message: string, error?: Err) {
		errorMessage = message;
		// Auto-trigger external login on InputRequiredError
		if (error instanceof InputRequiredError) {
			// Prefer no UI if external auth is expected
			mode = 'login';
			try {
				await authAPI.login({ type: 'external' });
			} catch (e) {
				// leave error bubble in place; user can retry
			}
		}
	}
</script>

<div class="absolute top-0 left-0 h-screen w-screen">
	{#if $authState.status === 'loading'}
		<div class="flex h-screen w-full items-center justify-center">
			<Icon icon="lucide:loader-circle" class="size-10 animate-spin" />
		</div>
	{:else if $authState.status === 'signed-out'}
		<div class="page flex min-h-screen min-w-screen items-center justify-center p-4">
			<div
				class="relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"
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
				{#if errorMessage}
					<div class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">
						{errorMessage}
					</div>
				{/if}

				<Accordion.Root type="single" bind:value={mode}>
					{#if $cachedUsers.length > 0}
						<Accordion.Item value="select">
							<Accordion.Trigger class="transition-all data-[state=open]:text-lg data-[state=open]:py-5 data-[state=open]:font-semibold data-[state=closed]:bg-muted/50 data-[state=closed]:py-3 data-[state=closed]:px-3 data-[state=closed]:rounded-md">Choose an account</Accordion.Trigger>
							<Accordion.Content>
								<SelectUserView onError={setErrorMessage} />
							</Accordion.Content>
						</Accordion.Item>
					{/if}

					<Accordion.Item value="login">
						<Accordion.Trigger class="transition-all data-[state=open]:text-lg data-[state=open]:py-5 data-[state=open]:font-semibold data-[state=closed]:bg-muted/50 data-[state=closed]:py-3 data-[state=closed]:px-3 data-[state=closed]:rounded-md">Sign in</Accordion.Trigger>
						<Accordion.Content>
							<LoginView onError={setErrorMessage} />
						</Accordion.Content>
					</Accordion.Item>

					<Accordion.Item value="register">
						<Accordion.Trigger class="transition-all data-[state=open]:text-lg data-[state=open]:py-5 data-[state=open]:font-semibold data-[state=closed]:bg-muted/50 data-[state=closed]:py-3 data-[state=closed]:px-3 data-[state=closed]:rounded-md">Create account</Accordion.Trigger>
						<Accordion.Content>
							<RegisterView onError={setErrorMessage} />
						</Accordion.Content>
					</Accordion.Item>
				</Accordion.Root>
			</div>
		</div>
	{:else}
		{@render children?.()}
	{/if}
</div>
