//#region IMPORTS
import { get } from 'svelte/store';
import type { Task } from '$domain/models/task';
import type { SvelteFlowInstance } from '@xyflow/svelte';
import type { WFNode } from '../types';
import { nodes, svelteFlowInstance } from './shared-state';
import { selectedTask } from './ui-state';
import { searchQuery, showRelatedNodes, handleSearch } from './search';
import { Err } from '$domain/errors';
//#endregion

//#region CENTER/HIGHLIGHT
export function centerNode(
	taskId: string,
	options: { zoom?: number } = { zoom: 1.5 }
) {
	const instance = get(svelteFlowInstance);
	const node = get(nodes).find((n) => n.id === taskId);
	if (!instance || !node || typeof instance.setCenter !== 'function') return;

	instance.setCenter(node.position.x, node.position.y, {
		duration: 250,
		zoom: options.zoom ?? 1.5,
	});

	highlightNode(node.id);
}

export function highlightNode(taskId: string) {
	// Dispatch highlight event to node DOM element
	const nodeElement = document.querySelector(
		`[data-tasknodeid="${taskId}"]`
	) as HTMLElement;
	if (nodeElement) {
		nodeElement.dispatchEvent(new CustomEvent('highlight', { bubbles: false }));
	} else {
		Err.UNHANDLED("[graph/navigation.highlightNode] Node element not found for taskId: " + taskId);
	}
}
//#endregion

//#region SHARE/URL
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
		baseHref: window.location.href,
	});
	replaceUrl(url);
	await copyToClipboard(url);
}

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
			centerNode(selectId);
			if (node?.data.type === 'task') {
				selectedTask.set((node.data.task) ?? null);
			}
		}, 500);
	}
}
//#endregion