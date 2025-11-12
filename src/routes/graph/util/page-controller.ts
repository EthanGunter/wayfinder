import { get } from 'svelte/store';
import type { Task } from '$domain/models/task';
import { allTasks, taskById, nodes, edges } from './core-state';
import { selectedTask } from './ui-state';
import { searchQuery, showRelatedNodes, filters, handleSearch } from './search';
import { elkLayoutEngine } from './layout';
import { buildGraph } from './graph-build';
import { centerNode } from './appearance';
import { svelteFlowInstance } from './core-state';

// Main graph update orchestration
export async function updateGraph(useLayout: boolean) {
	const filter = get(filters);
	const previous = { nodes: get(nodes), edges: get(edges) };
	const graph = await buildGraph({
		allTasks: get(allTasks),
		taskById,
		previous,
		filter,
		layoutEngine: elkLayoutEngine,
		layoutOptions: { direction: 'RIGHT' },
		useLayout
	});
	nodes.set(graph.nodes);
	edges.set(graph.edges);
}

// URL sharing
export function buildShareUrl({
	q,
	showRelatedNodes,
	baseHref,
}: {
	q: string;
	showRelatedNodes: boolean;
	baseHref: string;
}) {
	const url = new URL(baseHref);
	if (q?.trim()) url.searchParams.set('q', q);
	else url.searchParams.delete('q');
	url.searchParams.set('related', showRelatedNodes ? '1' : '0');
	url.searchParams.delete('highlight');
	return url.toString();
}

export function replaceUrl(url: string) {
	window.history.replaceState({}, '', url);
}

export async function copyToClipboard(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export async function handleShare() {
	const q = get(searchQuery) ?? '';
	const url = buildShareUrl({
		q,
		showRelatedNodes: get(showRelatedNodes),
		baseHref: window.location.href
	});
	replaceUrl(url);
	await copyToClipboard(url);
}

// URL initialization
export async function initializeFromUrl(params: URLSearchParams) {
	const selectId = params.get('select');
	const qParam = params.get('q');
	const showRelated = params.get('related');

	if (showRelated != null) {
		const normalized = showRelated.toLowerCase();
		showRelatedNodes.set(!(normalized === '0' || normalized === 'false'));
	}

	if (qParam) {
		await handleSearch(qParam);
	}

	if (selectId) {
		setTimeout(() => {
			const node = get(nodes).find((n) => n.id === selectId);
			centerNode(get(svelteFlowInstance), node, { select: true });
			if (node?.data?.type === 'task') {
				selectedTask.set((node.data as unknown as Task) ?? null);
			}
		}, 500);
	}
}