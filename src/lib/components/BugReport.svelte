<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';

	interface Props {
		onSubmit?: () => void;
	}
	const { onSubmit }: Props = $props();

	let form = $state<HTMLFormElement>();

	function submitBugReport() {
		if (!form) return;
		const formData = new FormData(form);

		const bugDesc = formData.get('description');
		const bugSteps = formData.get('steps');
		if (!bugDesc || !bugSteps) return;

		const userEmail = formData.get('email');
		const bugExpect = formData.get('expectation');

		//TODO In a real app, this would send the report to a backend service
		console.log('Bug report submitted:', {
			description: `${bugDesc} - ${bugSteps} - ${bugExpect} - ${userEmail}`,
			email: userEmail,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
			url: window.location.href
		});

		alert('Bug report submitted! Thank you for your feedback.');
		onSubmit?.();
	}

	const textAreaStyle =
		'font-inherit w-full rounded border border-gray-400 bg-gray-100 p-2 text-gray-800 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(25,155,230,0.2)] focus:outline-none';
</script>

<div class="p-4">
	<h1 class="m-0 mb-6">Thanks for catching a bug for us!</h1>

	<form onsubmit={submitBugReport} bind:this={form}>
		<div class="mb-6 flex flex-col gap-5">
			<div>
				<label for="bug-description" class="mb-2 block font-medium text-gray-800"
					>Description *</label
				>
				<textarea
					id="bug-description"
					name="description"
					placeholder="Please describe what happened"
					required
					rows={2}
					class={textAreaStyle}
				></textarea>
			</div>
			<div>
				<label for="bug-expectation" class="mb-2 block font-medium text-gray-800"
					>Expectation <span class="opacity-50">(optional)</span></label
				>
				<textarea
					id="bug-expectation"
					name="expectation"
					placeholder="What did you expected to happen?"
					rows={2}
					class={textAreaStyle}
				></textarea>
			</div>
			<div>
				<label for="bug-steps" class="mb-2 block font-medium text-gray-800">Reproduction Steps *</label>
				<textarea
					id="bug-steps"
					name="steps"
					placeholder="The more specific, the more likely it will get solved"
					required
					rows={2}
					class={textAreaStyle}
				></textarea>
			</div>
		</div>

		<div class="mb-6">
			<label for="user-email" class="mb-2 block font-medium text-gray-800"
				>Email <span class="opacity-50">(optional)</span></label
			>
			<input
				id="user-email"
				name="email"
				type="email"
				placeholder="your.email@example.com"
				class="font-inherit w-full rounded border border-gray-400 bg-gray-100 p-2 text-gray-800 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(25,155,230,0.2)] focus:outline-none"
			/>
			<small class="ms-4 mt-1 block text-sm text-gray-400"
				>We'll only use this to follow up on your report</small
			>
		</div>
		<div class="flex justify-end gap-3">
			<Button onclick={onSubmit} variant="outline">Cancel</Button>
			<Button onclick={submitBugReport} type="submit" class="primary">Submit</Button>
		</div>
	</form>
</div>
