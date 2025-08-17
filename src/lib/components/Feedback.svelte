<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';
	import Tabs from './ui/tabs/tabs.svelte';
	import TabsList from './ui/tabs/tabs-list.svelte';
	import TabsContent from './ui/tabs/tabs-content.svelte';
	import { TabsTrigger } from './ui/tabs';

	interface Props {
		onSubmit?: () => void;
	}
	const { onSubmit }: Props = $props();

	let form = $state<HTMLFormElement>();

	function closeBugReport() {
		// TODO reset form values
	}

	function submitBugReport() {
		if (!form) return;
		const formData = new FormData(form);

		const msg = formData.get('message');
		if (!msg) return;

		const userEmail = formData.get('email');

		//TODO In a real app, this would send the report to a backend service
		console.log('Bug report submitted:', {
			description: `${msg} - ${userEmail}`,
			email: userEmail,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		alert('Bug report submitted! Thank you for your feedback.');
		onSubmit?.();
		closeBugReport();
	}

	const textAreaStyle =
		'font-inherit w-full rounded border border-gray-400 bg-gray-100 p-2 text-gray-800 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(25,155,230,0.2)] focus:outline-none';
</script>

<div class="p-4">
	<h1 class="m-0 mb-6">Something on your mind?</h1>

	<form onsubmit={submitBugReport} bind:this={form}>
		<div class="mb-6">
			<label for="message" class="mb-2 block font-medium text-gray-800">Message *</label>
			<textarea
				id="message"
				name="description"
				placeholder="Write your message here"
				required
				rows={2}
				class={textAreaStyle}
			></textarea>
		</div>

		<div class="mb-6">
			<label for="user-email" class="mb-2 block font-medium text-gray-800"
				>Email <span class="opacity-50">(optional)</span></label
			>
			<input
				id="user-email"
				name="email"
				type="email"
				placeholder="email@example.com"
				class={textAreaStyle}
			/>
			<small class="ms-4 mt-1 block text-sm text-gray-400"
				>We'll only use this if we have more questions</small
			>
		</div>
		<div class="flex justify-end gap-3">
			<Button onclick={closeBugReport} variant="outline">Cancel</Button>
			<Button onclick={submitBugReport} type="submit" class="primary">Submit</Button>
		</div>
	</form>
</div>
