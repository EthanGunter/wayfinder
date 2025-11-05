import type { Task } from '$domain/models/task';
import type { ASTNode } from './parser';
import type { QueryOperator } from './types';
import { fieldRegistry } from './fieldHandlers';
import { ParseError } from '$domain/errors';

/**
 * Evaluates a query AST against a set of tasks.
 * Currently only handles single KVP nodes (no AND/OR/groups yet).
 */
export class QueryEvaluator {
	/**
	 * Evaluate a single KVP node against a task
	 */
	private evaluateKVP(task: Task, node: Extract<ASTNode, { type: 'kvp' }>): boolean {
		const handler = fieldRegistry[node.key];

		if (!handler) {
			// Unknown field - for now, return false (could throw or handle differently)
			throw new ParseError(
				`Unknown field: ${node.key}`,
				'search expression',
				node.start,
				node.end
			);
		}

		try {
			// Parse the value
			const parsedValue = handler.parseValue(node.value);

			// Check if task matches
			const matches = handler.matches(task, node.op as QueryOperator, parsedValue);

			// Apply negation if needed
			return node.negated ? !matches : matches;
		} catch (error) {
			// Re-throw parse errors with position info
			if (error instanceof Error) {
				throw new ParseError(
					`Error evaluating ${node.key}:${node.value}: ${error.message}`,
					'search expression',
					node.start,
					node.end
				);
			}
			throw error;
		}
	}

	/**
	 * Evaluate an AST node against a task
	 */
	private evaluateNode(task: Task, node: ASTNode): boolean {
		switch (node.type) {
			case 'kvp':
				return this.evaluateKVP(task, node);

			case 'and':
			case 'or':
			case 'group':
				throw new ParseError(
					'Logical operators (AND/OR) and groups are not yet supported',
					'search expression',
					0,
					0
				);

			default:
				throw new ParseError(`Unknown AST node type: ${(node as any).type}`, 'search expression', 0, 0);
		}
	}

	/**
	 * Filter tasks that match the query AST
	 */
	evaluate(tasks: Task[], ast: ASTNode): Task[] {
		return tasks.filter((task) => this.evaluateNode(task, ast));
	}
}

