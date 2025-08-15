<script lang="ts">
	import { Button } from '@/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export interface Props {
		forElement: string | HTMLElement;
		position?: 'top' | 'bottom' | 'left' | 'right';
		title?: string;
		content: string;
		showControls?: boolean;
		onNext?: () => void;
		onPrevious?: () => void;
		onSkip?: () => void;
	}

	const {
		forElement,
		position = 'top',
		title,
		content,
		showControls = true,
		onNext,
		onPrevious,
		onSkip
	}: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		<div class="w-full h-full">
			{#if title}
				<h3 class="m-0 mb-2 text-lg font-semibold text-gray-800">{title}</h3>
			{/if}
			<p class="m-0 mb-4 text-gray-800 leading-relaxed">{content}</p>

			{#if showControls}
				<div class="flex gap-2 justify-end flex-wrap">
					{#if onPrevious}
						<Button onclick={onPrevious} class="p-2 px-4 border border-gray-300 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-gray-50 text-gray-800 hover:opacity-90 hover:-translate-y-1">Previous</Button>
					{/if}
					{#if onNext}
						<Button onclick={onNext} class="p-2 px-4 border border-blue-500 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-blue-500 text-white hover:opacity-90 hover:-translate-y-1">Next</Button>
					{/if}
					{#if onSkip}
						<Button onclick={onSkip} class="p-2 px-4 border-none rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-transparent text-gray-500 hover:opacity-90 hover:-translate-y-1">Skip Tutorial</Button>
					{/if}
				</div>
			{/if}
		</div>
	</Tooltip.Trigger>
	<Tooltip.Content side={position} class="bg-white text-gray-800 border border-gray-300 shadow-lg p-4 max-w-sm">
		{#if title}
			<h3 class="m-0 mb-2 text-lg font-semibold text-gray-800">{title}</h3>
		{/if}
		<p class="m-0 mb-4 text-gray-800 leading-relaxed">{content}</p>

		{#if showControls}
			<div class="flex gap-2 justify-end flex-wrap">
				{#if onPrevious}
					<Button onclick={onPrevious} class="p-2 px-4 border border-gray-300 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-gray-50 text-gray-800 hover:opacity-90 hover:-translate-y-1">Previous</Button>
				{/if}
				{#if onNext}
					<Button onclick={onNext} class="p-2 px-4 border border-blue-500 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-blue-500 text-white hover:opacity-90 hover:-translate-y-1">Next</Button>
				{/if}
				{#if onSkip}
					<Button onclick={onSkip} class="p-2 px-4 border-none rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-transparent text-gray-500 hover:opacity-90 hover:-translate-y-1">Skip Tutorial</Button>
				{/if}
			</div>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
