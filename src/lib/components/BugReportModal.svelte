<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';

	interface Props {
		onSubmit?: () => void;
		children: Snippet;
	}
	const { children, onSubmit }: Props = $props();

	let showModal = $state(false);
	let bugDescription = $state('');
	let userEmail = $state('');

	function closeBugReport() {
		showModal = false;
		bugDescription = '';
		userEmail = '';
	}

	function submitBugReport() {
		//TODO In a real app, this would send the report to a backend service
		console.log('Bug report submitted:', {
			description: bugDescription,
			email: userEmail,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		alert('Bug report submitted! Thank you for your feedback.');
		onSubmit?.();
		closeBugReport();
	}
</script>

<Button class="text-2xl cursor-pointer p-1 rounded" onclick={() => (showModal = true)} aria-label="Report a bug">
	{@render children()}
</Button>

<Dialog.Root bind:open={showModal}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Report a Bug</Dialog.Title>
		</Dialog.Header>
		<div class="p-6">
			<p class="m-0 mb-6 text-gray-600">Help us improve by describing the issue you encountered:</p>

			<form onsubmit={submitBugReport}>
				<div class="mb-6">
					<label for="bug-description" class="block mb-2 font-medium text-gray-800">Description *</label>
					<textarea
						id="bug-description"
						bind:value={bugDescription}
						placeholder="Please describe what happened, what you expected, and steps to reproduce..."
						required
						rows="4"
						class="w-full p-2 border border-gray-400 rounded bg-gray-100 text-gray-800 font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(25,155,230,0.2)] resize-y min-h-[100px]"
					></textarea>
				</div>

				<div class="mb-6">
					<label for="user-email" class="block mb-2 font-medium text-gray-800">Email (optional)</label>
					<input
						id="user-email"
						type="email"
						bind:value={userEmail}
						placeholder="your.email@example.com"
						class="w-full p-2 border border-gray-400 rounded bg-gray-100 text-gray-800 font-inherit focus:outline-none focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(25,155,230,0.2)]"
					/>
					<small class="block mt-1 text-gray-500 text-sm">We'll only use this to follow up on your report</small>
				</div>
			</form>
		</div>
		<Dialog.Footer>
			<Button onclick={submitBugReport} class="primary">Submit</Button>
			<Button onclick={closeBugReport} variant="outline">Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
