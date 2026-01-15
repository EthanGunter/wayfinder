/** Project editor logic: state management, data persistence, UI state, navigation, search, and SvelteFlow integration */

/** Graph view state persistence: collapsed nodes stored in localStorage */
export {
	getCollapsedNodeIds,
	setNodeCollapsed,
	clearNodeCollapsed,
} from './data-persistence';

/** Shared graph state: app data, view nodes/edges, visibility, collapse management */
export {
	appData,
	viewNodes,
	viewEdges,
	svelteFlowInstance,
	hiddenByCollapse,
	getEdgeKey,
	shouldShowNode,
	resetGraphState,
	recalculateHiddenByCollapse,
	toggleCollapseChildren,
	restoreCollapseState,
} from './shared-state';

/** UI state: selected node, drawer, editor layout, auto-layout, completion visibility */
export {
	autoLayout,
	showCompletedNodes,
	pendingNodeParams,
	selectedNode,
	drawerOpen,
	drawerParams,
	layoutPaused,
	editorLayoutState,
	resetUIState,
} from './ui-state';
export type {
	DrawerParams,
	PendingNodeIntent,
} from './ui-state';

/** Navigation utilities: centering/highlighting nodes, URL building, sharing, URL initialization */
export {
	centerAndHighlightNode,
	highlightNode,
	buildShareUrl,
	replaceUrl,
	copyToClipboard,
	handleShare,
	initializeFromUrl,
} from './navigation';

/** Search functionality: query parsing, filtering, related nodes computation */
export {
	searchQuery,
	activeSearchResults,
	isValidQuery,
	showRelatedNodes,
	relatedDepth,
	filteredIds,
	handleSearch,
	recomputeFilters,
	resetSearchState,
} from './search';

/** SvelteFlow event handlers and adapter: node/edge interactions, connection validation, cycle detection */
export {
	SvelteFlowEventHandlers,
	SvelteFlowAdapter,
} from './svelte-flow';

/** UI state types */
export type {
	DrawerParams,
	PendingNodeIntent,
} from './ui-state';
