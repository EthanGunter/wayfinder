import { Index } from 'flexsearch';
import type { Task } from '../../../domain/models/task';
import { isTaskCompleted } from '../../../domain/models/task';

export interface TaskSearchResult {
	task: Task;
	score: number;
	matchedFields: string[];
}

export class TaskSearchService {
	private titleIndex: Index;
	private contentIndex: Index;
	private combinedIndex: Index;
	private taskMap = new Map<string, Task>();

	constructor() {
		// Create separate indexes for different search strategies
		this.titleIndex = new Index({
			tokenize: 'full', // Better for partial matches
			resolution: 3,       // Lower resolution for more fuzzy matching
			encoder: "LatinSoundex"
		});

		this.contentIndex = new Index({
			tokenize: 'full',
			resolution: 1,       // Very fuzzy for content
			encoder: "LatinSoundex"
		});

		// Combined index for general searching
		this.combinedIndex = new Index({
			tokenize: 'full',
			resolution: 2,       // Medium fuzzy
			encoder: "LatinSoundex"
		});
	}

	/**
	 * Add or update a task in the search index
	 */
	indexTask(task: Task): void {
		this.taskMap.set(task.id, task);

		// Index title with higher weight
		if (task.title) {
			this.titleIndex.add(task.id, task.title);
		}

		// Index content
		if (task.content) {
			this.contentIndex.add(task.id, task.content);
		}

		// Combined index for general search
		const searchableText = [task.title, task.content].filter(Boolean).join(' ');
		if (searchableText.trim()) {
			this.combinedIndex.add(task.id, searchableText);
		}
	}

	/**
	 * Remove a task from the search index
	 */
	removeTask(taskId: string): void {
		this.taskMap.delete(taskId);
		this.titleIndex.remove(taskId);
		this.contentIndex.remove(taskId);
		this.combinedIndex.remove(taskId);
	}

	/**
	 * Search for tasks with detailed results
	 */
	search(query: string, limit: number = 10): TaskSearchResult[] {
		if (!query.trim()) {
			return [];
		}

		const results = new Map<string, TaskSearchResult>();

		// Search titles (higher priority)
		const titleResults = this.titleIndex.search(query, limit * 2);
		(titleResults as string[]).forEach((id) => {
			const task = this.taskMap.get(id);
			if (task) {
				const existing = results.get(task.id);
				if (existing) {
					existing.score += 10; // Boost score for title matches
					existing.matchedFields.push('title');
				} else {
					results.set(task.id, {
						task,
						score: 10,
						matchedFields: ['title']
					});
				}
			}
		});

		// Search content
		const contentResults = this.contentIndex.search(query, limit * 2);
		(contentResults as string[]).forEach((id) => {
			const task = this.taskMap.get(id);
			if (task) {
				const existing = results.get(task.id);
				if (existing) {
					existing.score += 5; // Lower score for content matches
					if (!existing.matchedFields.includes('content')) {
						existing.matchedFields.push('content');
					}
				} else {
					results.set(task.id, {
						task,
						score: 5,
						matchedFields: ['content']
					});
				}
			}
		});

		// Search combined (fallback for partial matches)
		const combinedResults = this.combinedIndex.search(query, limit * 2);
		(combinedResults as string[]).forEach((id) => {
			const task = this.taskMap.get(id);
			if (task && !results.has(task.id)) {
				results.set(task.id, {
					task,
					score: 3,
					matchedFields: ['general']
				});
			}
		});

		// Apply additional scoring based on task properties
		const scoredResults = Array.from(results.values()).map(result => {
			let additionalScore = 0;

			// Boost incomplete tasks
			if (!isTaskCompleted(result.task)) {
				additionalScore += 2;
			}

			// Boost today's tasks
			if (result.task.todaysTask) {
				additionalScore += 3;
			}

			// Boost higher priority tasks
			if (result.task.priority) {
				additionalScore += Math.min(result.task.priority / 10, 2);
			}

			// Boost recently edited tasks
			const daysSinceEdit = (Date.now() - new Date(result.task.lastEdit).getTime()) / (1000 * 60 * 60 * 24);
			if (daysSinceEdit < 7) {
				additionalScore += Math.max(0, 2 - daysSinceEdit / 3.5);
			}

			return {
				...result,
				score: result.score + additionalScore
			};
		});

		// Sort by score and return top results
		return scoredResults
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	/**
	 * Simple search that returns just the tasks (for compatibility)
	 */
	searchTasks(query: string, limit: number = 10): Task[] {
		return this.search(query, limit).map(result => result.task);
	}

	/**
	 * Reindex all tasks (useful for bulk updates)
	 */
	reindexTasks(tasks: Task[]): void {
		// Clear existing indexes
		this.taskMap.clear();

		// Note: FlexSearch doesn't have a clear method, so we recreate the indexes
		this.titleIndex = new Index({
			tokenize: 'full', // Better for partial matches
			resolution: 3,       // Lower resolution for more fuzzy matching
			encoder: "LatinSoundex"
		});

		this.contentIndex = new Index({
			tokenize: 'full',
			resolution: 1,       // Very fuzzy for content
			encoder: "LatinSoundex"
		});


		this.combinedIndex = new Index({
			tokenize: 'full',
			resolution: 2,       // Medium fuzzy
			encoder: "LatinSoundex"
		});

		// Reindex all tasks
		tasks.forEach(task => this.indexTask(task));
	}

	/**
	 * Get statistics about the search index
	 */
	getStats() {
		return {
			totalTasks: this.taskMap.size,
			indexedTasks: this.taskMap.size
		};
	}
}
