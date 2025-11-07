import { ParseError } from '$domain/errors';
import type { Single, Range, MultiValue } from './types';

// ============================================================================
// Regex Patterns
// ============================================================================

/** Matches range expressions: "lower..upper" */
const REGEX_RANGE = /^(.+?)\.\.(.+)$/;

/** Matches tolerance with ± symbol: "anchor±tolerance" */
const REGEX_TOLERANCE_PLUS_MINUS = /^(.+?)\s*±\s*(.+)$/;

/** Matches tolerance with slash notation: "anchor+/-tolerance" or "anchor-/+tolerance" */
const REGEX_TOLERANCE_SLASH = /^(.+?)\s*([+\-])\s*\/\s*([+\-])\s*(.+)$/;

/** Matches tolerance with adjacent signs: "anchor+-tolerance" or "anchor-+tolerance" */
const REGEX_TOLERANCE_ADJACENT = /^(.+?)\s*([+\-])\s*([+\-])\s*(.+)$/;

/** Matches tolerance with single sign: "anchor+tolerance" or "anchor-tolerance" */
const REGEX_TOLERANCE_SINGLE = /^(.+?)\s*([+\-])\s*(.+)$/;

// ============================================================================

/**
 * Collection boolean expression AST node types
 */
type CollectionASTNode =
	| { type: 'term'; value: string }
	| { type: 'and'; left: CollectionASTNode; right: CollectionASTNode }
	| { type: 'or'; left: CollectionASTNode; right: CollectionASTNode };

/**
 * Parses a collection string[] into a boolean expression AST.
 * Each item in the array may contain:
 * - ',' and '|' as OR operators (within items)
 * - '&' as AND operator (within items)
 * - Precedence: AND > OR
 * 
 * The collection array itself represents OR-separated items (split by ',' in tokenizer).
 * Example: ["a", "b&c", "d"] parses as: a OR (b AND c) OR d
 * Example: ["a|b", "c&d"] parses as: (a OR b) OR (c AND d)
 */
export function parseCollectionExpression(collection: string[]): CollectionASTNode {
	if (collection.length === 0) {
		throw new ParseError('Empty collection', 'search expression', 0, 0);
	}

	if (collection.length === 1) {
		return parseORExpression(collection[0]);
	}

	let result = parseORExpression(collection[0]);
	for (let i = 1; i < collection.length; i++) {
		result = {
			type: 'or',
			left: result,
			right: parseORExpression(collection[i])
		};
	}
	return result;
}

/**
 * Parse OR expression (lowest precedence)
 */
function parseORExpression(input: string): CollectionASTNode {
	const parts = splitByOperator(input, ['|', ',']);
	
	if (parts.length === 1) {
		return parseANDExpression(parts[0]);
	}

	let result = parseANDExpression(parts[0]);
	for (let i = 1; i < parts.length; i++) {
		result = {
			type: 'or',
			left: result,
			right: parseANDExpression(parts[i])
		};
	}
	return result;
}

/**
 * Parse AND expression (higher precedence)
 */
function parseANDExpression(input: string): CollectionASTNode {
	const parts = splitByOperator(input, ['&']);
	
	if (parts.length === 1) {
		return { type: 'term', value: parts[0].trim() };
	}

	let result: CollectionASTNode = { type: 'term', value: parts[0].trim() };
	for (let i = 1; i < parts.length; i++) {
		result = {
			type: 'and',
			left: result,
			right: { type: 'term', value: parts[i].trim() }
		};
	}
	return result;
}

/**
 * Split string by operators, respecting quoted strings
 */
function splitByOperator(input: string, operators: string[]): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < input.length) {
		const char = input[i];
		
		if (char === '"') {
			inQuotes = !inQuotes;
			current += char;
		} else if (!inQuotes) {
			let matched = false;
			for (const op of operators) {
				if (input.slice(i).startsWith(op)) {
					if (current.trim()) {
						parts.push(current.trim());
						current = '';
					}
					i += op.length - 1; // -1 because we'll increment below
					matched = true;
					break;
				}
			}
			if (!matched) {
				current += char;
			}
		} else {
			current += char;
		}
		i++;
	}

	if (current.trim()) {
		parts.push(current.trim());
	}

	return parts.filter(p => p.length > 0);
}

/**
 * Evaluates a collection boolean expression AST by calling matches on each term.
 * Returns the final boolean result.
 */
export function evaluateCollectionExpression<T>(
	ast: CollectionASTNode,
	transformValue: (raw: string) => T,
	matches: (value: Single<T>) => boolean
): boolean {
	switch (ast.type) {
		case 'term':
			const transformed = transformValue(ast.value);
			return matches({ kind: 'single', data: transformed });
		
		case 'and':
			return evaluateCollectionExpression(ast.left, transformValue, matches) &&
			       evaluateCollectionExpression(ast.right, transformValue, matches);
		
		case 'or':
			return evaluateCollectionExpression(ast.left, transformValue, matches) ||
			       evaluateCollectionExpression(ast.right, transformValue, matches);
	}
}

/**
 * Parses a range expression: "a..b"
 * Returns the lower and upper bounds as strings.
 */
export function parseRange(value: string): { lower: string; upper: string } | null {
	const trimmed = value.trim();
	const rangeMatch = trimmed.match(REGEX_RANGE);
	if (!rangeMatch) {
		return null;
	}
	return {
		lower: rangeMatch[1].trim(),
		upper: rangeMatch[2].trim()
	};
}

/**
 * Parses a tolerance expression: "anchor+5", "anchor-5", "anchor±5", "anchor+/-5", "anchor-/+5", etc.
 * Handles spaces: "anchor + 5", "anchor - 5"
 * Returns anchor and tolerance as strings, plus which signs are present.
 */
export function parseTolerance(value: string): { anchor: string; tolerance: string; hasPlus: boolean; hasMinus: boolean } | null {
	const trimmed = value.trim();
	
	// Try to match tolerance patterns
	// Patterns: anchor±tol, anchor+tol, anchor-tol, anchor+/-tol, anchor-/+tol
	// Also handle spaces: anchor + tol, anchor - tol
	
	// First try ± symbol
	const plusMinusMatch = trimmed.match(REGEX_TOLERANCE_PLUS_MINUS);
	if (plusMinusMatch) {
		return {
			anchor: plusMinusMatch[1].trim(),
			tolerance: plusMinusMatch[2].trim(),
			hasPlus: true,
			hasMinus: true
		};
	}

	// Try +/- or -/+
	const slashMatch = trimmed.match(REGEX_TOLERANCE_SLASH);
	if (slashMatch) {
		const hasPlus = slashMatch[2] === '+' || slashMatch[3] === '+';
		const hasMinus = slashMatch[2] === '-' || slashMatch[3] === '-';
		return {
			anchor: slashMatch[1].trim(),
			tolerance: slashMatch[4].trim(),
			hasPlus,
			hasMinus
		};
	}

	// Try +- or -+ (adjacent)
	const adjacentMatch = trimmed.match(REGEX_TOLERANCE_ADJACENT);
	if (adjacentMatch && adjacentMatch[2] !== adjacentMatch[3]) {
		return {
			anchor: adjacentMatch[1].trim(),
			tolerance: adjacentMatch[4].trim(),
			hasPlus: true,
			hasMinus: true
		};
	}

	// Try single + or -
	const singleMatch = trimmed.match(REGEX_TOLERANCE_SINGLE);
	if (singleMatch) {
		const isPlus = singleMatch[2] === '+';
		return {
			anchor: singleMatch[1].trim(),
			tolerance: singleMatch[3].trim(),
			hasPlus: isPlus,
			hasMinus: !isPlus
		};
	}

	return null;
}

/**
 * Coerces tolerance to Range<T> using arithmetic helpers.
 * Handles cases:
 * - '+' only: [anchor, anchor + tol]
 * - '-' only: [anchor - tol, anchor]
 * - Both: [anchor - tol, anchor + tol]
 */
export function coerceToleranceToRange<T>(
	anchor: T,
	tolerance: T,
	hasPlus: boolean,
	hasMinus: boolean,
	add: ((a: T, b: T) => T) | undefined,
	sub: ((a: T, b: T) => T) | undefined
): Range<T> {
	if (hasPlus && hasMinus) {
		// Both signs: [anchor - tol, anchor + tol]
		if (!add || !sub) {
			throw new Error('Both add and sub are required when both +/- signs are present');
		}
		return {
			kind: 'range',
			lower: sub(anchor, tolerance),
			upper: add(anchor, tolerance),
			inclusive: true
		};
	} else if (hasPlus) {
		// '+' only: [anchor, anchor + tol]
		if (!add) {
			throw new Error('add is required when + sign is present');
		}
		return {
			kind: 'range',
			lower: anchor,
			upper: add(anchor, tolerance),
			inclusive: true
		};
	} else if (hasMinus) {
		// '-' only: [anchor - tol, anchor]
		if (!sub) {
			throw new Error('sub is required when - sign is present');
		}
		return {
			kind: 'range',
			lower: sub(anchor, tolerance),
			upper: anchor,
			inclusive: true
		};
	} else {
		// Shouldn't happen, but fallback
		return {
			kind: 'range',
			lower: anchor,
			upper: anchor,
			inclusive: true
		};
	}
}

