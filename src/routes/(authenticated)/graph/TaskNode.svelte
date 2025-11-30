<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { devEnabled } from '$lib/user-settings';
	import { type FlowNode, type FlowData } from './types';
	import Icon from '@iconify/svelte';

	interface Props {
		id: string;
		data: FlowData<Task>;
		selected: boolean;
	}

	let { id, data: flowNode, selected }: Props = $props();
	const isDimmed = $derived(flowNode.dimmed ?? false);

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
	data-tasknodeid={flowNode.wfNode.id}
	class="task-node relative rounded-md border-1 border-gray-300 shadow-sm transition-shadow duration-150 hover:shadow-md
	{isTaskCompleted(flowNode.wfNode) ? 'bg-green-100' : 'bg-white'}"
	class:highlighted={isAnimating}
	class:dimmed={isDimmed}
>
	<div class="flex items-start gap-2 px-3 py-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div class="text-wrap max-w-[16rem] line-clamp-2 text-sm font-semibold text-gray-900" title={flowNode.wfNode.data.title}>
				{flowNode.wfNode.data.title}
			</div>
			<span class="text-xs text-gray-400">
				{#if flowNode.wfNode.data.content}
					<Icon icon="lucide:text" />
				{/if}
			</span>
			{#if $devEnabled}
				<div class="text-[7px]">
					<span>node-id: {id}</span>
					{#if flowNode.wfNode.parents.length > 0}
						<h6>Parents</h6>
					{/if}
					{#each flowNode.wfNode.parents as parent}
						<span>- {parent.substring(0, 5)}</span>
						<br />
					{/each}
					{#if flowNode.wfNode.children.length > 0}
						<h6>Children</h6>
					{/if}
					{#each flowNode.wfNode.children as child}
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
