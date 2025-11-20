<script lang="ts">
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import type { Props } from '.';

	let { value, onChange }: Props = $props();

	let showMarkdown = $state(true);
	let notesEl = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		value;
		if (notesEl) autosize(notesEl);
	});

	function autosize(el: HTMLTextAreaElement | HTMLInputElement) {
		if (!el || !(el instanceof HTMLTextAreaElement)) return;

		// Only apply height logic to textarea; inputs don't need it
		el.style.height = '0px';
		// Compensate for borders/padding reliably
		const borderBox = el.offsetHeight - el.clientHeight;
		el.style.height = Math.max(el.scrollHeight + borderBox, 0) + 'px';
	}
</script>

<div
	class="shrink-0 rounded-md p-2 text-sm text-gray-700 placeholder-gray-400 outline-1 focus:ring-0"
>
	{#if showMarkdown && value}
		<div
			class="markdown"
			onclick={() => {
				showMarkdown = false;
				setTimeout(() => {
					notesEl?.focus();
				});
			}}
		>
			<SvelteMarkdown source={value} />
		</div>
	{:else}
		<textarea
			class="w-full resize-none"
			bind:this={notesEl}
			name="content"
			bind:value
			placeholder="Add notes or description..."
			oninput={() => onChange?.(value)}
			use:autosize
			onblur={() => (showMarkdown = true)}
			onfocus={() => (showMarkdown = false)}
		></textarea>
	{/if}
</div>

<style lang="scss">
	:global(.markdown) {
		:global(ul) {
			list-style: disc;
			padding-left: 1rem;
		}
		:global(ol) {
			list-style: decimal;
			padding-left: 1rem;
		}

		:global(blockquote) {
			border-left: 4px solid #ccc;
			padding-left: 1rem;
		}

		:global(pre) {
			display: flex;
			:global(code) {
				width: 100%;
			}
		}
	}
</style>
