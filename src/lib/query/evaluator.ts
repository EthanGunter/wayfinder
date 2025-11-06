import type { ASTNode, QueryOperator, FieldRegistry, ParsedValue } from './types';
import { ParseError } from '$domain/errors';

/**
 * Evaluates a query AST against a set of entities.
 * Supports KVP nodes, logical operators (AND/OR), and grouped expressions.
 */
export class QueryEvaluator<TEntity> {
	private fieldRegistry: FieldRegistry<TEntity>;

	constructor(fieldRegistry: FieldRegistry<TEntity>) {
		this.fieldRegistry = fieldRegistry;
	}

	/**
	 * Evaluate a single KVP node against an entity
	 */
	private evaluateKVP(entity: TEntity, node: Extract<ASTNode, { type: 'kvp' }>): boolean {
		const handler = this.fieldRegistry[node.key];

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
			// Value is already parsed by tokenizer, but handlers expect ParsedValue (not array)
			// For arrays, we need to handle them specially
			let parsedValue: ParsedValue;
			if (Array.isArray(node.value)) {
				// For arrays, we'll need to check if any element matches
				// This is a simplified approach - handlers may need array support
				parsedValue = node.value[0];
			} else {
				parsedValue = node.value;
			}

			// Check if entity matches
			const matches = handler.matches(entity, node.op as QueryOperator, parsedValue);

			// Apply negation if needed
			return node.negated ? !matches : matches;
		} catch (error) {
			// Re-throw parse errors with position info
			if (error instanceof Error) {
				throw new ParseError(
					`Error evaluating ${node.key}: ${error.message}`,
					'search expression',
					node.start,
					node.end
				);
			}
			throw error;
		}
	}

	/**
	 * Evaluate an AST node against an entity
	 */
	private evaluateNode(entity: TEntity, node: ASTNode): boolean {
		switch (node.type) {
			case 'kvp':
				return this.evaluateKVP(entity, node);

			case 'and':
				return this.evaluateNode(entity, node.left) && this.evaluateNode(entity, node.right);

			case 'or':
				return this.evaluateNode(entity, node.left) || this.evaluateNode(entity, node.right);

			case 'group':
				return this.evaluateNode(entity, node.child);

			default:
				throw new ParseError(`Unknown AST node type: ${(node as any).type}`, 'search expression', 0, 0);
		}
	}

	/**
	 * Filter entities that match the query AST
	 */
	evaluate(entities: TEntity[], ast: ASTNode): TEntity[] {
		return entities.filter((entity) => this.evaluateNode(entity, ast));
	}
}

