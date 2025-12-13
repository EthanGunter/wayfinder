<script lang="ts">
	import { authAPI } from '$lib/API/Auth';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '../ui/button';
	import { Input } from '../ui/input';
	import { toast } from 'svelte-sonner';
	import * as Alert from '../ui/alert';
	import Icon from '@iconify/svelte';

	type Props = {
		email?: string;
	};

	let { email = $bindable('') }: Props = $props();

	let showForgotPassword = $state(false);
	let errorMessage = $state('');

	async function handleResetPassword() {
		const [res, error] = await authAPI.sendResetPassword(email);
		if (error) {
			errorMessage = error.message;
		} else {
			toast.success(res.userMessage);
			showForgotPassword = false;
		}
	}

	$effect(() => {
		if (!showForgotPassword) errorMessage = '';
	});
</script>

<Dialog.Root bind:open={showForgotPassword}>
	<Dialog.Trigger
		type="button"
		class="mx-auto max-w-max p-0 text-sm font-light text-foreground/50 hover:underline"
	>
		reset password
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<h2 class="text-2xl font-bold">Reset password</h2>
		</Dialog.Header>
		{#if errorMessage}
			<Alert.Root variant="destructive">
				<Icon icon="lucide:alert-circle" />
				<!-- <Alert.Title>Error</Alert.Title> -->
				<Alert.Description>
					{errorMessage}
				</Alert.Description>
			</Alert.Root>
		{/if}
		<Dialog.Description>Enter your email to reset your password.</Dialog.Description>
		<Input type="email" placeholder="Email" bind:value={email} />

		<Dialog.Footer>
			<Button
				variant="secondary"
				class="text-foreground/50"
				onclick={() => (showForgotPassword = false)}>Cancel</Button
			>
			<Button onclick={handleResetPassword}>Reset password</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
