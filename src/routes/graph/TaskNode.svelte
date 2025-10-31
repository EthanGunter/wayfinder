<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { isTaskCompleted, type Task } from '$domain/models/task';
	import { devEnabled } from '$lib/user-settings';

	let { data }: { data: Task } = $props();

// Node click/selection is handled by SvelteFlow; no custom pointer logic needed
</script>
	<div
    class="task-node relative max-w-[280px] min-w-[100px] rounded-md border-1 border-gray-300 bg-white shadow-sm transition-shadow duration-150 hover:shadow-md"
	>
		<div class="flex items-start gap-2 px-3 py-2 {isTaskCompleted(data) ? 'bg-green-100' : ''}">
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold text-gray-900" title={data?.title}>
					{data?.title}
				</div>
				{#if data?.content}
					<div class="mt-0.5 line-clamp-2 text-xs text-gray-600" title={data?.content}>
						{data?.content}
					</div>
				{/if}
				{#if $devEnabled}
					<div class="text-[7px]">
						<span>id: {data.id.substring(0, 4)}</span>
						{#if data.parents.length > 0}
							<h6>Parents</h6>
						{/if}
						{#each data.parents as parent}
							<span>- {parent.substring(0, 4)}</span>
							<br />
						{/each}
						{#if data.children.length > 0}
							<h6>Children</h6>
						{/if}
						{#each data.children as child}
							<span>- {child.substring(0, 4)}</span>
							<br />
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<Handle type="target" position={Position.Top} />
		<Handle type="source" position={Position.Bottom} />
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
		box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.45), 0 1px 2px rgba(0, 0, 0, 0.05);
	}
</style>
