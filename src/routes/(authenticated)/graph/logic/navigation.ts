//#region IMPORTS
import { get } from 'svelte/store';
import { viewNodes, svelteFlowInstance } from './shared-state';
import { selectedNode } from './ui-state';
import { searchQuery, showRelatedNodes, handleSearch } from './search';
import { Err } from '$domain/errors';
//#endregion

//#region CENTER/HIGHLIGHT
export function centerAndHighlightNode(
	taskId: string,
	options: { zoom?: number, duration?: number } = { zoom: 1.5, duration: 400 }
) {
	const instance = get(svelteFlowInstance);
	const node = viewNodes.get(taskId);
	if (!instance || !node) return;

	instance.setCenter(node.position.x, node.position.y, {
		duration: options.duration,
		zoom: options.zoom,
	});

	highlightNode(taskId);
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
			const node = viewNodes.get(selectId);
			centerAndHighlightNode(selectId);
			if (node?.data.appNode.data.type === 'task') { // ew lol
				selectedNode.set(node.data.appNode);
			}
		}, 500);
	}
}
//#endregion