// util/search.ts
import { writable, type Writable } from 'svelte/store';
import { get } from 'svelte/store';
import type { Task } from '$domain/models/task';
import { parseQuery } from '$lib/query/parser';
import { QueryEvaluator } from '$lib/query/evaluator';
import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';
import { computeRelatedTasks } from './appearance';
import { allTasks, taskById } from './core-state';

// Search state
export const searchQuery: Writable<string> = writable('');
export const activeSearchResults: Writable<Task[]> = writable([]);
export const isStructuredQuery: Writable<boolean> = writable(false);
export const showRelatedNodes: Writable<boolean> = writable(true);
export const relatedDepth: Writable<number> = writable(-1);

// Filter result (matching + related nodes)
export const filters: Writable<{ matching: Set<string>; related: Set<string> } | null> =
	writable(null);

// Structured query with fallback contains search
function searchTasks(tasks: Task[], query: string): {
	results: Task[];
	isStructured: boolean;
} {
	const trimmed = query.trim();
	if (!trimmed) return { results: [], isStructured: false };

	try {
		const ast = parseQuery(trimmed);
		const evaluator = new QueryEvaluator(taskQueryFieldRegistry);
		const results = evaluator.evaluate(tasks, ast);
		return { results, isStructured: true };
	} catch {
		const ql = trimmed.toLowerCase();
		const results =
			tasks.length === 0
				? []
				: tasks.filter(
					(t) =>
						(t.title && t.title.toLowerCase().includes(ql)) ||
						(t.content && t.content.toLowerCase().includes(ql))
				);
		return { results, isStructured: false };
	}
}

// Main search handler - updates all search state
export async function handleSearch(query: string): Promise<Task[]> {
	searchQuery.set(query);
	const { results, isStructured } = searchTasks(get(allTasks), query);
	activeSearchResults.set(results);
	isStructuredQuery.set(isStructured);
	return results;
}

// Computes filter based on current search state
export function computeSearchFilter(): { matching: Set<string>; related: Set<string> } | null {
	const tasks = get(allTasks);
	const results = get(activeSearchResults);
	const structured = get(isStructuredQuery);
	const showRelated = get(showRelatedNodes);
	const depth = get(relatedDepth);

	if (tasks.length === 0) return null;

	return structured && results.length > 0
		? computeRelatedTasks(
			new Set(results.map((t) => t.id)),
			taskById,
			showRelated,
			depth
		)
		: null;
}

export function resetSearchState() {
	searchQuery.set('');
	activeSearchResults.set([]);
	isStructuredQuery.set(false);
	showRelatedNodes.set(true);
	relatedDepth.set(-1);
	filters.set(null);
}