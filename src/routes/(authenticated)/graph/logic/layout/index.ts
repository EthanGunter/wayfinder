import type { LayoutEngine } from "./LayoutEngine";
import { ElkLayoutEngine } from "./ELK";
import { viewNodes, viewEdges } from "../shared-state";
import { autoLayout } from "../ui-state";

const LAYOUT_DEBOUNCE_MS = 150;

// Create instance and initialize
export const layoutEngine: LayoutEngine = new ElkLayoutEngine();

let unsubNodes: (() => void) | null = null;
let unsubEdges: (() => void) | null = null;

// Auto-layout on structural changes (node add/remove, edge add/remove)
autoLayout.subscribe((autoLayout) => { // TODO this is technically a memory leak
	if (autoLayout) {
		unsubNodes = viewNodes.subscribe(({ op }) => {
			// Only trigger on add/delete, not updates (position changes, etc.)
			if (op === 'add' /* || op === 'delete' */) {
				layoutEngine.start(LAYOUT_DEBOUNCE_MS);
			}
		});

		unsubEdges = viewEdges.subscribe(({ op }) => {
			if (op === 'add' /* || op === 'delete' */) {
				layoutEngine.start(LAYOUT_DEBOUNCE_MS);
			}
		});
	} else {
		unsubNodes?.();
		unsubEdges?.();
	}
});