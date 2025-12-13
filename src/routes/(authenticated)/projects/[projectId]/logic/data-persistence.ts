const STORAGE_KEY = 'wf.graph-view.v1';
const DEBOUNCE_MS = 500;

type GraphViewState = {
	collapsedNodeIds: string[];
	// future: nodePositions?, viewport?, etc.
};

// In-memory state
let state: GraphViewState = loadFromStorage();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function loadFromStorage(): GraphViewState {
	if (typeof localStorage === 'undefined') return { collapsedNodeIds: [] };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { collapsedNodeIds: [] };
		const parsed = JSON.parse(raw) as Partial<GraphViewState>;
		return {
			collapsedNodeIds: Array.isArray(parsed.collapsedNodeIds) 
				? parsed.collapsedNodeIds.filter((id): id is string => typeof id === 'string')
				: [],
		};
	} catch {
		return { collapsedNodeIds: [] };
	}
}

function scheduleFlush(): void {
	if (flushTimeout) clearTimeout(flushTimeout);
	flushTimeout = setTimeout(() => {
		if (typeof localStorage === 'undefined') return;
		try {
			// Only persist if there's non-default state
			if (state.collapsedNodeIds.length === 0) {
				localStorage.removeItem(STORAGE_KEY);
			} else {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			}
		} catch {
			// ignore storage errors
		}
		flushTimeout = null;
	}, DEBOUNCE_MS);
}

export function getCollapsedNodeIds(): Set<string> {
	return new Set(state.collapsedNodeIds);
}

export function setNodeCollapsed(id: string): void {
	if (!state.collapsedNodeIds.includes(id)) {
		state.collapsedNodeIds.push(id);
		scheduleFlush();
	}
}

export function clearNodeCollapsed(id: string): void {
	const idx = state.collapsedNodeIds.indexOf(id);
	if (idx !== -1) {
		state.collapsedNodeIds.splice(idx, 1);
		scheduleFlush();
	}
}

