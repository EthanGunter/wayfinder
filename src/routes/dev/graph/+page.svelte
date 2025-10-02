<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Background,
		Position,
		type Node,
		type Edge,
		useSvelteFlow,
		BackgroundVariant
	} from '@xyflow/svelte';
	import { Checkbox } from '@/components/ui/checkbox';
	import { runElkLayout, type ElkLayoutOptions } from './ELKlayout';
	import AppHeader from '@/components/AppHeader.svelte';
	import AppFooter from '@/components/AppFooter.svelte';
	import '@xyflow/svelte/dist/style.css';
	import { settings } from '@/user-settings/config';

	let shouldlog = $state(false);
	let isLayingOut = $state(false);
	let elkOptions = $state<ElkLayoutOptions>({
		'elk.algorithm': 'layered',
		'elk.direction': 'RIGHT',
		'elk.edgeRouting': 'ORTHOGONAL',
		'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
		'elk.layered.cycleBreaking.strategy': 'GREEDY',
		'elk.layered.considerModelOrder': false,
		'elk.layered.feedbackEdges': false,
		'elk.layered.mergeEdges': false,
		'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
		'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
		'elk.layered.nodePlacement.bk.fixedAlignment': 'NONE',
		'elk.layered.nodePlacement.bk.edgeStraightening': false,
		'elk.layered.nodePlacement.bk.alignToRoot': false,
		'elk.layered.spacing.nodeNodeBetweenLayers': 50,
		'elk.layered.spacing.edgeEdgeBetweenLayers': 10,
		'elk.layered.spacing.edgeNodeBetweenLayers': 10,
		'elk.spacing.nodeNode': 30,
		'elk.spacing.edgeNode': 20,
		'elk.spacing.edgeEdge': 10,
		'elk.spacing.portPort': 6,
		'elk.spacing.componentComponent': 30,
		'elk.edgeLabels.placement': 'CENTER'
	});

	function setOption(key: string, value: string | number | boolean) {
		elkOptions = { ...elkOptions, [key]: value };
	}

	function parseAndSetOption(key: string, raw: string) {
		if (raw === 'true' || raw === 'false') {
			setOption(key, raw === 'true');
			return;
		}
		const num = Number(raw);
		if (!Number.isNaN(num) && raw.trim() !== '') {
			setOption(key, num);
			return;
		}
		setOption(key, raw);
	}

	let nodes = $state<Node[]>([
		{ id: 'in-1', type: 'input', data: { label: 'Input 1' }, position: { x: -300, y: -150 } },
		{ id: 'in-2', type: 'input', data: { label: 'Input 2' }, position: { x: -300, y: 150 } },
		{ id: 'n-1', type: 'default', data: { label: 'Default A' }, position: { x: 0, y: -150 } },
		{ id: 'n-2', type: 'default', data: { label: 'Default B' }, position: { x: 0, y: 0 } },
		{ id: 'n-3', type: 'default', data: { label: 'Default C' }, position: { x: 0, y: 150 } },
		{ id: 'out-1', type: 'output', data: { label: 'Output 1' }, position: { x: 300, y: -75 } },
		{ id: 'out-2', type: 'output', data: { label: 'Output 2' }, position: { x: 300, y: 125 } },
		{ id: 'solo', data: { label: 'Solo (disconnected)' }, position: { x: 0, y: 300 } }
	]);
	let edges = $state<Edge[]>([
		{ id: 'e-in1-n1', source: 'in-1', target: 'n-1', type: 'straight', label: 'straight' },
		{ id: 'e-in2-n3', source: 'in-2', target: 'n-3', type: 'step', label: 'step' },
		{
			id: 'e-n1-n2',
			source: 'n-1',
			target: 'n-2',
			type: 'default',
			label: 'default',
			animated: true
		},
		{ id: 'e-n2-n3', source: 'n-2', target: 'n-3', type: 'smoothstep', label: 'smoothstep' },
		{ id: 'e-n2-out1', source: 'n-2', target: 'out-1', type: 'bezier', label: 'bezier' },
		{ id: 'e-n3-out2', source: 'n-3', target: 'out-2', type: 'bezier' }
	]);

	function logEvent(name: string, e: any) {
		if (!shouldlog) return;
		console.log(name + ':', e);
	}

	async function applyElk() {
		isLayingOut = true;
		elkOptions['elk.algorithm'] = 'layered';
		try {
			const laidOut = await runElkLayout(nodes, edges, elkOptions, { width: 180, height: 48 });
			nodes = laidOut;
		} finally {
			isLayingOut = false;
		}
	}
</script>

<div class="graph-root page page-root">
	<AppHeader />

	<SvelteFlowProvider>
		<SvelteFlow
			bind:nodes
			bind:edges
			fitView
			oninit={() => logEvent('oninit', null)}
			onflowerror={(ev) => logEvent('onflowerror', ev)}
			ondelete={(payload) => logEvent('ondelete', payload)}
			onbeforedelete={(payload) => {
				logEvent('onbeforedelete', payload);
				return Promise.resolve(true);
			}}
			onbeforeconnect={(edge) => logEvent('onbeforeconnect', edge)}
			onconnect={(connection) => logEvent('onconnect', connection)}
			onconnectstart={(params) => logEvent('onconnectstart', params)}
			onconnectend={(params) => logEvent('onconnectend', params)}
			onclickconnectstart={(params) => logEvent('onclickconnectstart', params)}
			onclickconnectend={(params) => logEvent('onclickconnectend', params)}
			onreconnect={(edge) => logEvent('onreconnect', edge)}
			onreconnectstart={(params) => logEvent('onreconnectstart', params)}
			onreconnectend={(params) => logEvent('onreconnectend', params)}
			onbeforereconnect={(edge) => logEvent('onbeforereconnect', edge)}
			onmovestart={(vp) => logEvent('onmovestart', vp)}
			onmove={(vp) => logEvent('onmove', vp)}
			onmoveend={(vp) => logEvent('onmoveend', vp)}
			onselectionchange={(sel) => logEvent('onselectionchange', sel)}
			onselectiondragstart={(event, nodes) => logEvent('onselectiondragstart', { event, nodes })}
			onselectiondrag={(event, nodes) => logEvent('onselectiondrag', { event, nodes })}
			onselectiondragstop={(event, nodes) => logEvent('onselectiondragstop', { event, nodes })}
			onselectionstart={(event) => logEvent('onselectionstart', event)}
			onselectionend={(event) => logEvent('onselectionend', event)}
			onpaneclick={({ event }) => logEvent('onpaneclick', event)}
			onpanecontextmenu={({ event }) => logEvent('onpanecontextmenu', event)}
			onnodeclick={({ node, event }) => logEvent('onnodeclick', { node, event })}
			onnodecontextmenu={({ node, event }) => logEvent('onnodecontextmenu', { node, event })}
			onnodedrag={({ targetNode, nodes, event }) =>
				logEvent('onnodedrag', { targetNode, nodes, event })}
			onnodedragstart={({ targetNode, nodes, event }) =>
				logEvent('onnodedragstart', { targetNode, nodes, event })}
			onnodedragstop={({ targetNode, nodes, event }) =>
				logEvent('onnodedragstop', { targetNode, nodes, event })}
			onnodepointerenter={({ node, event }) => logEvent('onnodepointerenter', { node, event })}
			onnodepointerleave={({ node, event }) => logEvent('onnodepointerleave', { node, event })}
			onnodepointermove={({ node, event }) => logEvent('onnodepointermove', { node, event })}
			onedgeclick={({ edge, event }) => logEvent('onedgeclick', { edge, event })}
			onedgecontextmenu={({ edge, event }) => logEvent('onedgecontextmenu', { edge, event })}
			onedgepointerenter={({ edge, event }) => logEvent('onedgepointerenter', { edge, event })}
			onedgepointerleave={({ edge, event }) => logEvent('onedgepointerleave', { edge, event })}
			defaultEdgeOptions={{ type: 'bezier' }}
			nodeOrigin={[0.5, 0.5]}
		>
			<div
				class="absolute top-5 left-5 z-19 flex w-min flex-wrap items-center justify-center gap-2 rounded border-1 bg-white p-2"
			>
				<div class="flex items-center gap-1">
					<label for="dev-log-events" class="text-xs">Log events</label>
					<Checkbox id="dev-log-events" bind:checked={shouldlog} />
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-direction" class="text-xs">Direction</label>
					<select
						id="elk-direction"
						bind:value={elkOptions['elk.direction']}
						class="border px-1 py-0.5 text-xs"
					>
						<option value="RIGHT">RIGHT</option>
						<option value="LEFT">LEFT</option>
						<option value="DOWN">DOWN</option>
						<option value="UP">UP</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layered-strategy" class="text-xs">Node placement</label>
					<select
						id="elk-layered-strategy"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.nodePlacement.strategy']}
					>
						<option value="SIMPLE">SIMPLE</option>
						<option value="NETWORK_SIMPLEX">NETWORK_SIMPLEX</option>
						<option value="BRANDES_KOEPF">BRANDES_KOEPF</option>
						<option value="LINEAR_SEGMENTS">LINEAR_SEGMENTS</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layered-crossMin" class="text-xs">Crossing minimization</label>
					<select
						id="elk-layered-crossMin"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.crossingMinimization.strategy']}
					>
						<option value="LAYER_SWEEP">LAYER_SWEEP</option>
						<option value="INTERACTIVE">INTERACTIVE</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-cycleBreaking" class="text-xs">Cycle breaking</label>
					<select
						id="elk-cycleBreaking"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.cycleBreaking.strategy']}
					>
						<option value="GREEDY">GREEDY</option>
						<option value="INTERACTIVE">INTERACTIVE</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-considerOrder" class="text-xs">Respect input order</label>
					<select
						id="elk-considerOrder"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.considerModelOrder']}
					>
						<option value={false}>false</option>
						<option value={true}>true</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layered-layerSpacing" class="text-xs">Layer spacing</label>
					<input
						id="elk-layered-layerSpacing"
						type="number"
						class="w-16 border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.spacing.nodeNodeBetweenLayers']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layered-edgeNodeBetween" class="text-xs">Edge-Node between layers</label>
					<input
						id="elk-layered-edgeNodeBetween"
						type="number"
						class="w-16 border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.spacing.edgeNodeBetweenLayers']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layered-edgeEdgeBetween" class="text-xs">Edge-Edge between layers</label>
					<input
						id="elk-layered-edgeEdgeBetween"
						type="number"
						class="w-16 border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.spacing.edgeEdgeBetweenLayers']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-edgeRouting" class="text-xs">Edge routing</label>
					<select
						id="elk-edgeRouting"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.edgeRouting']}
					>
						<option value="ORTHOGONAL">ORTHOGONAL</option>
						<option value="POLYLINE">POLYLINE</option>
						<option value="SPLINES">SPLINES</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-edgeLabels" class="text-xs">Edge label placement</label>
					<select
						id="elk-edgeLabels"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.edgeLabels.placement']}
					>
						<option value="CENTER">CENTER</option>
						<option value="HEAD">HEAD</option>
						<option value="TAIL">TAIL</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-layering" class="text-xs">Layering</label>
					<select
						id="elk-layering"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.layering.strategy']}
					>
						<option value="NETWORK_SIMPLEX">NETWORK_SIMPLEX</option>
						<option value="LONGEST_PATH">LONGEST_PATH</option>
						<option value="INTERACTIVE">INTERACTIVE</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-mergeEdges" class="text-xs">Merge edges</label>
					<select
						id="elk-mergeEdges"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.mergeEdges']}
					>
						<option value={false}>false</option>
						<option value={true}>true</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-feedbackEdges" class="text-xs">Mark feedback edges</label>
					<select
						id="elk-feedbackEdges"
						class="border px-1 py-0.5 text-xs"
						bind:value={elkOptions['elk.layered.feedbackEdges']}
					>
						<option value={false}>false</option>
						<option value={true}>true</option>
					</select>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-spacing-node" class="text-xs">Node spacing</label>
					<input
						id="elk-spacing-node"
						class="w-16 border px-1 py-0.5 text-xs"
						type="number"
						bind:value={elkOptions['elk.spacing.nodeNode']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-spacing-edgeNode" class="text-xs">Edge-Node</label>
					<input
						id="elk-spacing-edgeNode"
						class="w-16 border px-1 py-0.5 text-xs"
						type="number"
						bind:value={elkOptions['elk.spacing.edgeNode']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-spacing-edgeEdge" class="text-xs">Edge-Edge</label>
					<input
						id="elk-spacing-edgeEdge"
						class="w-16 border px-1 py-0.5 text-xs"
						type="number"
						bind:value={elkOptions['elk.spacing.edgeEdge']}
					/>
				</div>
				<div class="flex items-center gap-1">
					<label for="elk-spacing-portPort" class="text-xs">Port-Port</label>
					<input
						id="elk-spacing-portPort"
						class="w-16 border px-1 py-0.5 text-xs"
						type="number"
						bind:value={elkOptions['elk.spacing.portPort']}
					/>
				</div>
				{#if elkOptions['elk.algorithm'] === 'force' || elkOptions['elk.algorithm'] === 'stress'}
					<div class="flex items-center gap-1">
						<label for="elk-iterations" class="text-xs">Iterations</label>
						<input
							id="elk-iterations"
							type="number"
							class="w-16 border px-1 py-0.5 text-xs"
							bind:value={elkOptions['elk.iterations']}
						/>
					</div>
					<div class="flex items-center gap-1">
						<label for="elk-force-temperature" class="text-xs">Initial temp</label>
						<input
							id="elk-force-temperature"
							type="number"
							class="w-16 border px-1 py-0.5 text-xs"
							bind:value={elkOptions['org.eclipse.elk.force.temperature']}
						/>
					</div>
				{/if}
				{#if elkOptions['elk.algorithm'] === 'radial'}
					<div class="flex items-center gap-1">
						<label for="elk-radial-radius" class="text-xs">Radius</label>
						<input
							id="elk-radial-radius"
							type="number"
							class="w-16 border px-1 py-0.5 text-xs"
							bind:value={elkOptions['org.eclipse.elk.radial.radius']}
						/>
					</div>
				{/if}
				<button
					class="border px-2 py-1 text-xs"
					onclick={applyElk}
					disabled={isLayingOut}
					title="Run ELK layout with current options"
				>
					{isLayingOut ? 'Laying out…' : 'Apply ELK'}
				</button>
			</div>
			<!-- nodeTypes={{ task: CustomNode }}
		edgeTypes={{ task: CustomEdge }} -->
			<Background variant={BackgroundVariant.Lines} />
		</SvelteFlow>
	</SvelteFlowProvider>

	<AppFooter />
</div>

<style>
	:global(.svelte-flow__attribution) {
		display: none;
	}
</style>
