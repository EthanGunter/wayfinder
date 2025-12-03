import type { ASTNode, FieldRegistry, MultiValue, Single, Range } from './types';
import { ParseError } from '$domain/errors';
import { ValueTransformError } from './types';
import {
	parseCollectionExpression,
	evaluateCollectionExpression,
	parseRange,
	parseTolerance,
	coerceToleranceToRange
} from './valueParsers';

/**
 * Evaluates a query AST against a set of entities.
 * Supports KVP nodes, logical operators (AND/OR), and grouped expressions.
 * Values are transformed via handler.transformValue() before matching.
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
			throw new ParseError(
				`Unknown field: ${node.key}`,
				'search expression',
				node.start,
				node.end
			);
		}

		// Capability check: operator
		if (!handler.operators.includes(node.op)) {
			throw new ParseError(
				`Operator '${node.op}' not supported for field '${node.key}'. Supported operators: ${handler.operators.join(', ')}`,
				'search expression',
				node.start,
				node.end
			);
		}

		const valueOps = handler.valueOps || [];
		const cardinality = handler.cardinality || 'single';

		// Handle collections (array values)
		if (Array.isArray(node.value)) {
			// Check if collections are supported
			if (!valueOps.includes('[]')) {
				throw new ParseError(
					`Collections not allowed for field '${node.key}'`,
					'search expression',
					node.start,
					node.end
				);
			}

			// Collections only work with == and !=
			if (node.op !== '==' && node.op !== '!=') {
				throw new ParseError(
					`Collections only allowed with '==' or '!=' operators for field '${node.key}'`,
					'search expression',
					node.start,
					node.end
				);
			}

			// Parse collection expression
			let collectionAST;
			try {
				collectionAST = parseCollectionExpression(node.value);
			} catch (error) {
				if (error instanceof ParseError) {
					throw error;
				}
				throw new ParseError(
					`Invalid collection expression for field '${node.key}'`,
					'search expression',
					node.start,
					node.end
				);
			}

			// Check for '&' in single-value fields
			if (cardinality === 'single') {
				const hasAnd = this.collectionASTHasAnd(collectionAST);
				if (hasAnd) {
					throw new ParseError(
						`Single-value field '${node.key}' cannot use the '&' operator. Cannot be two things at once.`,
						'search expression',
						node.start,
						node.end
					);
				}
			}

			// Evaluate collection expression
			return evaluateCollectionExpression(
				collectionAST,
				(raw) => {
					try {
						return handler.transformValue(raw);
					} catch (error) {
						if (error instanceof ValueTransformError) {
							throw new ParseError(
								error.msg,
								'search expression',
								node.start,
								node.end
							);
						}
						throw error;
					}
				},
				(single: Single<any>) => {
					return handler.matches(entity, node.op, single);
				}
			);
		}

		// Handle single string value
		const rawValue = node.value;
		let multiValue: MultiValue<any>;

		try {
			// Try parsing as range first
			const rangeParts = parseRange(rawValue);
			if (rangeParts) {
				if (!valueOps.includes('..')) {
					throw new ParseError(
						`Range syntax '..' not supported for field '${node.key}'`,
						'search expression',
						node.start,
						node.end
					);
				}

				// Range only works with == and !=
				if (node.op !== '==' && node.op !== '!=') {
					throw new ParseError(
						`Operator '${node.op}' is not supported with range values for field '${node.key}'. Use '==' or '!='.`,
						'search expression',
						node.start,
						node.end
					);
				}

				const lower = handler.transformValue(rangeParts.lower);
				const upper = handler.transformValue(rangeParts.upper);
				multiValue = { kind: 'range', lower, upper, inclusive: true } as Range<typeof lower>;
			} else {
				// Try parsing as tolerance
				const toleranceParts = parseTolerance(rawValue);
				if (toleranceParts) {
					const hasPlus = toleranceParts.hasPlus;
					const hasMinus = toleranceParts.hasMinus;

					if (!valueOps.includes('+') && !valueOps.includes('-')) {
						throw new ParseError(
							`Tolerance syntax not supported for field '${node.key}'`,
							'search expression',
							node.start,
							node.end
						);
					}

					// Check if required arithmetic helpers are present
					if ((hasPlus && !handler.arith?.add) || (hasMinus && !handler.arith?.sub)) {
						throw new ParseError(
							`Field '${node.key}' supports tolerance operators but does not provide required add/sub arithmetic.`,
							'search expression',
							node.start,
							node.end
						);
					}

					// Tolerance only works with == and !=
					if (node.op !== '==' && node.op !== '!=') {
						throw new ParseError(
							`Operator '${node.op}' is not supported with range values for field '${node.key}'. Use '==' or '!='.`,
							'search expression',
							node.start,
							node.end
						);
					}

					const anchor = handler.transformValue(toleranceParts.anchor);
					const tolerance = handler.transformValue(toleranceParts.tolerance);

					multiValue = coerceToleranceToRange(
						anchor,
						tolerance,
						hasPlus,
						hasMinus,
						handler.arith?.add,
						handler.arith?.sub
					) as Range<any>;
				} else {
					// Single value
					const transformed = handler.transformValue(rawValue);
					multiValue = { kind: 'single', data: transformed } as Single<typeof transformed>;
				}
			}
		} catch (error) {
			if (error instanceof ValueTransformError) {
				throw new ParseError(
					error.msg,
					'search expression',
					node.start,
					node.end
				);
			}
			if (error instanceof ParseError) {
				throw error;
			}
			throw error;
		}

		// Call handler.matches with MultiValue
		return handler.matches(entity, node.op, multiValue);
	}

	/**
	 * Check if a collection AST contains any AND operators
	 */
	private collectionASTHasAnd(ast: ReturnType<typeof parseCollectionExpression>): boolean {
		if (ast.type === 'term') {
			return false;
		}
		if (ast.type === 'and') {
			return true;
		}
		// ast.type === 'or'
		return this.collectionASTHasAnd(ast.left) || this.collectionASTHasAnd(ast.right);
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
				throw new ParseError(`Unknown AST node type: ${JSON.stringify(node)}`, 'search expression', 0, 0);
		}
	}

	/**
	 * Filter entities that match the query AST
	 */
	evaluate(entities: TEntity[], ast: ASTNode): TEntity[] {
		return entities.filter((entity) => this.evaluateNode(entity, ast));
	}
}

