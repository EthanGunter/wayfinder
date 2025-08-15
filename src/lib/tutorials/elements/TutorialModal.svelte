<script lang="ts">
	import { Button } from '@/components/ui/button';

	export interface Props {
		title?: string;
		content: string;
		onNext?: () => void;
		onPrevious?: () => void;
		onSkip?: () => void;
		showControls?: boolean;
		size?: 'small' | 'medium' | 'large';
	}

	const {
		title,
		content,
		onNext,
		onPrevious,
		onSkip,
		showControls = true,
		size = 'medium'
	}: Props = $props();

	const sizeClasses = {
		small: 'max-w-md w-[90%]',
		medium: 'max-w-2xl w-[90%]',
		large: 'max-w-4xl w-[95%]'
	};
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001]">
	<div class="bg-white rounded-lg p-8 shadow-[0_8px_24px_rgba(0,0,0,0.2)] max-h-[80vh] overflow-y-auto {sizeClasses[size]}">
		{#if title}
			<h2 class="m-0 mb-4 text-2xl font-semibold text-gray-800">{title}</h2>
		{/if}
		<div class="mb-8 text-gray-800 leading-relaxed">
			{content}
		</div>

		{#if showControls}
			<div class="flex gap-2 justify-end flex-wrap">
				{#if onPrevious}
					<Button onclick={onPrevious} class="p-3 px-6 border border-gray-300 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-gray-50 text-gray-800 hover:opacity-90 hover:-translate-y-1">Previous</Button>
				{/if}
				{#if onNext}
					<Button onclick={onNext} class="p-3 px-6 border border-blue-500 rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-blue-500 text-white hover:opacity-90 hover:-translate-y-1">Next</Button>
				{/if}
				{#if onSkip}
					<Button onclick={onSkip} class="p-3 px-6 border-none rounded cursor-pointer text-sm transition-all duration-200 ease-in-out bg-transparent text-gray-500 hover:opacity-90 hover:-translate-y-1">Skip Tutorial</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>
