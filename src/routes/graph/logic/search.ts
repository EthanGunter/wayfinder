//#region STORES
import { writable, type Writable } from 'svelte/store';
import { get } from 'svelte/store';
import type { Task } from '$domain/models/task';
import { parseQuery } from '$lib/query/parser';
import { QueryEvaluator } from '$lib/query/evaluator';
import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';
import { allTasks, taskById } from './shared-state';

export const searchQuery: Writable<string> = writable('');
export const activeSearchResults: Writable<Task[]> = writable([]);
export const isValidQuery: Writable<boolean> = writable(false);
export const showRelatedNodes: Writable<boolean> = writable(true);
export const relatedDepth: Writable<number> = writable(-1);

export const filteredIds: Writable<{ matching: Set<string>; related: Set<string> } | null> =
	writable(null);
//#endregion

//#region INTERNAL
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
						(t.data.title && t.data.title.toLowerCase().includes(ql)) ||
						(t.data.content && t.data.content.toLowerCase().includes(ql))
				);
		return { results, isStructured: false };
	}
}

function computeRelatedTasks(
	matchingIds: Set<string>,
	includeRelated: boolean,
	relatedDepth: number
): { matching: Set<string>; related: Set<string> } {
	if (!includeRelated) return { matching: matchingIds, related: new Set() };

	const related = new Set<string>();
	const visited = new Set<string>();

	const walkUp = (id: string, depth: number) => {
		if (visited.has(id)) return;
		visited.add(id);
		const t = taskById.get(id);
		if (!t) return;
		for (const p of t.parents) {
			if (!matchingIds.has(p)) related.add(p);
			if (relatedDepth === -1 || depth < relatedDepth) walkUp(p, depth + 1);
		}
	};

	const walkDown = (id: string, depth: number) => {
		if (visited.has(id)) return;
		visited.add(id);
		const t = taskById.get(id);
		if (!t) return;
		for (const c of t.children) {
			if (!matchingIds.has(c)) related.add(c);
			if (relatedDepth === -1 || depth < relatedDepth) walkDown(c, depth + 1);
		}
	};

	for (const id of matchingIds) {
		visited.clear();
		walkUp(id, 1);
		visited.clear();
		walkDown(id, 1);
	}

	return { matching: matchingIds, related };
}
//#endregion

//#region ACTIONS
export async function handleSearch(query: string): Promise<Task[]> {
	searchQuery.set(query);
	const { results, isStructured } = searchTasks(get(allTasks), query);
	activeSearchResults.set(results);
	isValidQuery.set(isStructured);

	const tasks = get(allTasks);
	const showRel = get(showRelatedNodes);
	const depth = get(relatedDepth);
	const filter =
		tasks.length > 0 && isStructured && results.length > 0
			? computeRelatedTasks(new Set(results.map((t) => t.id)), showRel, depth)
			: null;
	filteredIds.set(filter);

	return results;
}

export function recomputeFilters() {
	const tasks = get(allTasks);
	const results = get(activeSearchResults);
	const validQuery = get(isValidQuery);
	const showRel = get(showRelatedNodes);
	const depth = get(relatedDepth);

	const filter =
		tasks.length > 0 && validQuery && results.length > 0
			? computeRelatedTasks(new Set(results.map((t) => t.id)), showRel, depth)
			: null;
	filteredIds.set(filter);
}

export function resetSearchState() {
	searchQuery.set('');
	activeSearchResults.set([]);
	isValidQuery.set(false);
	showRelatedNodes.set(true);
	relatedDepth.set(-1);
	filteredIds.set(null);
}
//#endregion