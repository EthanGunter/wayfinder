<script lang="ts">
	import {
		BaseEdge,
		EdgeReconnectAnchor,
		getBezierPath,
		EdgeLabel,
		type EdgeProps
	} from '@xyflow/svelte';

	let { sourceX, sourceY, targetX, targetY, selected, data }: EdgeProps = $props();

	const [edgePath, labelX, labelY] = $derived(
		getBezierPath({
			sourceX,
			sourceY,
			targetX,
			targetY
		})
	);

	let reconnecting = $state(false);
	let style = $derived(!reconnecting ? 'border-radius: 100%;' : '');
</script>

<!-- We want to hide the initial edge while reconnecting -->
{#if !reconnecting}
	<BaseEdge path={edgePath} />
	<!-- <EdgeLabel x={labelX} y={labelY} selectEdgeOnClick>
	  Select the edge and drag the ends to reconnect
	</EdgeLabel> -->
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
