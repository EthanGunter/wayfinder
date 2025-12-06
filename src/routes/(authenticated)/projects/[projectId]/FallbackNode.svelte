<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';

	let { id }: NodeProps = $props();
</script>

<div class="fallback-node rounded-md border-2 border-destructive bg-destructive/10 p-3 text-destructive">
	<div class="font-semibold text-sm">Unknown node type</div>
	<div class="text-xs break-all opacity-80">id: {id}</div>
	<div class="text-xs opacity-80">This node type is not supported.</div>
	<Handle type="target" position={Position.Left} />
	<Handle type="source" position={Position.Right} />
</div>

<style>
	.fallback-node :global(.svelte-flow__handle) {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 9999px;
		border: 2px solid currentColor;
		background: #fff;
	}
</style>

