<script lang="ts">
	import {
		BaseEdge,
		EdgeReconnectAnchor,
		getBezierPath,
		type EdgeProps,
		Position
	} from '@xyflow/svelte';

	let { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps = $props();

	const isDimmed = $derived(data?.dimmed ?? false);

	const [edgePath, labelX, labelY] = $derived(
		getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition: sourcePosition ?? Position.Right,
			targetPosition: targetPosition ?? Position.Left
		})
	);

	let reconnecting = $state(false);
	let style = $derived(reconnecting ? '' : 'border-radius: 100%;');
</script>

<!-- We want to hide the initial edge while reconnecting -->
{#if !reconnecting}
	<BaseEdge path={edgePath} class={isDimmed ? 'dimmed-edge' : ''} />
{/if}

<EdgeReconnectAnchor
	bind:reconnecting
	type="source"
	position={{ x: sourceX, y: sourceY }}
	{style}
/>
<EdgeReconnectAnchor
	bind:reconnecting
	type="target"
	position={{ x: targetX, y: targetY }}
	{style}
/>

<style>
	:global(.dimmed-edge .svelte-flow__edge-path) {
		opacity: 0.3;
		stroke-dasharray: 5, 5;
	}
</style>
