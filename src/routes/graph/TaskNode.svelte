<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { devEnabled } from '$lib/user-settings';
	import { type WFNode, type FlowData } from './types';

	interface Props {
		id: string;
		data: FlowData<Task>;
		selected: boolean;
	}

	let { id, data, selected }: Props = $props();
	const isDimmed = $derived(data.dimmed ?? false);

	// Track animation state for one-time fade-out effect
	let isAnimating = $state(false);
	let nodeElement: HTMLDivElement | undefined = $state();
	let animationTimeout: ReturnType<typeof setTimeout> | null = $state(null);

	// Listen for highlight events
	$effect(() => {
		if (!nodeElement) return;

		const handleHighlight = () => {
			// Cancel existing animation timeout if any
			if (animationTimeout) {
				clearTimeout(animationTimeout);
				animationTimeout = null;
			}

			// Cancel current animation by removing class and forcing reflow
			isAnimating = false;
			if (nodeElement) {
				// Force reflow to reset animation
				void nodeElement.offsetHeight;
			}

			// Restart animation
			requestAnimationFrame(() => {
				isAnimating = true;
				// Animation completes after 2s
				animationTimeout = setTimeout(() => {
					isAnimating = false;
					animationTimeout = null;
				}, 2000);
			});
		};

		nodeElement.addEventListener('highlight', handleHighlight);
		return () => {
			nodeElement?.removeEventListener('highlight', handleHighlight);
			if (animationTimeout) {
				clearTimeout(animationTimeout);
			}
		};
	});

	// Node click/selection is handled by SvelteFlow; no custom pointer logic needed
</script>

<div
	bind:this={nodeElement}
	data-tasknodeid={data.task.id}
	class="task-node relative min-w-[200px] rounded-md border-1 border-gray-300 shadow-sm transition-shadow duration-150 hover:shadow-md
	{isTaskCompleted(data.task) ? 'bg-green-100' : 'bg-white'}"
	class:highlighted={isAnimating}
	class:dimmed={isDimmed}
>
	<div class="flex items-start gap-2 px-3 py-2">
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-semibold text-gray-900" title={data.task.title}>
				{data.task.title}
			</div>
			{#if data.task.content}
				<div class="mt-0.5 line-clamp-2 text-xs text-gray-600" title={data.task.content}>
					{data.task.content}
				</div>
			{/if}
			{#if $devEnabled}
				<div class="text-[7px]">
					<span>task-id: {data.task.id.substring(0, 5)}</span>
					<br />
					<span>node-id: {id}</span>
					{#if data.task.parents.length > 0}
						<h6>Parents</h6>
					{/if}
					{#each data.task.parents as parent}
						<span>- {parent.substring(0, 5)}</span>
						<br />
					{/each}
					{#if data.task.children.length > 0}
						<h6>Children</h6>
					{/if}
					{#each data.task.children as child}
						<span>- {child.substring(0, 5)}</span>
						<br />
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<Handle type="target" position={Position.Left} />
	<Handle type="source" position={Position.Right} />
</div>

<style>
	.task-node :global(.svelte-flow__handle) {
		width: 12px;
		height: 12px;
		border-radius: 9999px;
		border: 2px solid #d1d5db;
		background: white;
	}

	:global(.svelte-flow__node.selected) .task-node {
		box-shadow:
			0 0 0 1px rgba(59, 130, 246, 0.45),
			0 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.task-node.highlighted {
		animation: highlight-glow 2s ease-out forwards;
	}

	.task-node.dimmed {
		opacity: 0.4;
		filter: grayscale(0.3);
	}

	@keyframes highlight-glow {
		0% {
			box-shadow: 0 0 100px 10px rgba(105, 163, 255, 0);
		}
		20% {
			box-shadow: 0 0 2px 10px rgba(184, 211, 255, 0.5);
		}
		100% {
			box-shadow: 0 0 0 3px rgba(0, 0, 0, 0);
		}
	}
</style>
