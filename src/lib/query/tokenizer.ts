import type { ParsedValue, Token } from "./types";
import { parseDateValue } from "./dateParser";

class ParseError extends Error {
	constructor(message: string, public start: number, public end: number) {
		super(message);
	}
}

/**
 * Splits input by unquoted spaces, respecting quoted strings
 */
function splitByUnquotedSpaces(input: string): string[] {
	const segments: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < input.length) {
		const char = input[i];
		
		if (char === '"') {
			inQuotes = !inQuotes;
			current += char;
		} else if (char === ' ' && !inQuotes) {
			if (current.trim()) {
				segments.push(current.trim());
				current = '';
			}
		} else {
			current += char;
		}
		i++;
	}

	if (current.trim()) {
		segments.push(current.trim());
	}

	return segments.filter(s => s.length > 0);
}

/**
 * Parses CSV array: [val1, val2, val3] with spaces allowed
 * Validates homogeneity - all values must be same type
 */
function parseCSVArray(value: string): ParsedValue[] {
	const trimmed = value.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
		throw new Error('Invalid array format');
	}

	const content = trimmed.slice(1, -1).trim();
	if (!content) {
		return [];
	}

	const items: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < content.length) {
		const char = content[i];
		
		if (char === '"') {
			inQuotes = !inQuotes;
			current += char;
		} else if (char === ',' && !inQuotes) {
			if (current.trim()) {
				items.push(current.trim());
				current = '';
			}
		} else {
			current += char;
		}
		i++;
	}

	if (current.trim()) {
		items.push(current.trim());
	}

	// Parse each item and validate homogeneity
	const parsed: ParsedValue[] = [];
	let firstType: string | null = null;

	for (const item of items) {
		const parsedItem = parseSingleValue(item);
		const itemType = getValueType(parsedItem);
		
		if (firstType === null) {
			firstType = itemType;
		} else if (itemType !== firstType) {
			throw new Error(`Mixed types in array: expected ${firstType}, got ${itemType}`);
		}
		
		parsed.push(parsedItem);
	}

	return parsed;
}

/**
 * Gets the type string for a ParsedValue
 */
function getValueType(value: ParsedValue): string {
	if (typeof value === 'string') return 'string';
	if (typeof value === 'number') return 'number';
	if (value instanceof Date) return 'date';
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'object' && 'type' in value) {
		return value.type;
	}
	return 'unknown';
}

/**
 * Tests for null/empty operator: field:?
 */
function testNullOperator(value: string): boolean {
	return value.trim() === '?';
}

/**
 * Tests for fuzzy operator: field:~value
 */
function testFuzzyOperator(value: string): boolean {
	return value.trim().startsWith('~');
}

/**
 * Tests for regex operator: field:/pattern/flags
 */
function testRegexOperator(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.startsWith('/') && trimmed.length > 1;
}

/**
 * Tests for range modifier: start..end
 */
function testRangeModifier(value: string): { type: 'range'; top: ParsedValue; bottom: ParsedValue } | null {
	const match = value.match(/^(.+?)\.\.(.+)$/);
	if (!match) return null;

	const [, startStr, endStr] = match;
	
	try {
		const start = parseSingleValue(startStr.trim());
		const end = parseSingleValue(endStr.trim());

		// Both must be same type (number or date)
		const startType = getValueType(start);
		const endType = getValueType(end);

		if (startType !== endType) {
			throw new Error(`Range endpoints must be same type: ${startType} vs ${endType}`);
		}

		if (startType === 'number' && typeof start === 'number' && typeof end === 'number') {
			return {
				type: 'range',
				top: end,
				bottom: start
			};
		}

		if (startType === 'date' && start instanceof Date && end instanceof Date) {
			return {
				type: 'range',
				top: end,
				bottom: start
			};
		}

		throw new Error(`Range only supported for numbers and dates, got ${startType}`);
	} catch (error) {
		throw new Error(`Invalid range: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Tests for tolerance modifier: value±tolerance or value+/-tolerance or value-/+tolerance
 */
function testToleranceModifier(value: string): { type: 'tolerance'; value: number; tolerance: number } | null {
	// Match: number±number, number+/-number, number-/+number
	const match = value.match(/^(-?\d+(?:\.\d+)?)\s*([±]|\+\/-|-\/+)\s*(-?\d+(?:\.\d+)?)$/);
	if (!match) return null;

	const [, valueStr, op, toleranceStr] = match;
	const numValue = parseFloat(valueStr);
	const tolerance = parseFloat(toleranceStr);

	if (isNaN(numValue) || isNaN(tolerance)) {
		return null;
	}

	return {
		type: 'tolerance',
		value: numValue,
		tolerance: tolerance
	};
}

/**
 * Parses a single value string into ParsedValue
 * Converts relative dates to Date literals
 */
function parseSingleValue(valueStr: string): ParsedValue {
	const trimmed = valueStr.trim();

	// Try parsing as date (handles relative dates and converts them)
	try {
		return parseDateValue(trimmed);
	} catch {
		// Not a date, continue
	}

	// Try parsing as number
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
		const num = parseFloat(trimmed);
		if (!isNaN(num)) {
			return num;
		}
	}

	// Try parsing as boolean
	if (trimmed.toLowerCase() === 'true') return true;
	if (trimmed.toLowerCase() === 'false') return false;

	// Remove quotes if present
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
	    (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}

	// Default to string
	return trimmed;
}

/**
 * Parses a KVP value portion, handling modifiers
 */
function parseValue(valueStr: string, start: number, end: number): ParsedValue | ParsedValue[] {
	const trimmed = valueStr.trim();

	// Check for negation modifier
	const negated = trimmed.startsWith('!');
	const valueWithoutNegation = negated ? trimmed.slice(1).trim() : trimmed;

	// Check for array modifier
	if (valueWithoutNegation.startsWith('[') && valueWithoutNegation.endsWith(']')) {
		const array = parseCSVArray(valueWithoutNegation);
		return array;
	}

	// Check for range modifier
	const rangeResult = testRangeModifier(valueWithoutNegation);
	if (rangeResult) {
		const topType = getValueType(rangeResult.top);
		if (topType === 'number' && typeof rangeResult.top === 'number' && typeof rangeResult.bottom === 'number') {
			return { type: 'number-range', rangeTop: rangeResult.top, rangeBottom: rangeResult.bottom };
		}
		if (topType === 'date' && rangeResult.top instanceof Date && rangeResult.bottom instanceof Date) {
			return { type: 'date-range', rangeTop: rangeResult.top, rangeBottom: rangeResult.bottom };
		}
	}

	// Check for tolerance modifier
	const toleranceResult = testToleranceModifier(valueWithoutNegation);
	if (toleranceResult) {
		return {
			type: 'number-range',
			rangeTop: toleranceResult.value + toleranceResult.tolerance,
			rangeBottom: toleranceResult.value - toleranceResult.tolerance
		};
	}

	// Parse as single value
	return parseSingleValue(valueWithoutNegation);
}

/**
 * Parses a single KVP: key operator value (spaces optional)
 * Comparison operators (>=, <=, >, <, =) split key from value
 */
function parseKVP(kvpStr: string, start: number): Token {
	const trimmed = kvpStr.trim();
	
	// Try to find comparison operators that split key from value
	// Order matters: check >= and <= before > and <
	const comparisonOps = [
		{ search: '>=', op: '>=' },
		{ search: '<=', op: '<=' },
		{ search: '>', op: '>' },
		{ search: '<', op: '<' },
		{ search: '=', op: '=' }
	];

	let key = '';
	let op: string = '=';
	let valueStr = '';
	let valueStart = start;
	let valueEnd = start + kvpStr.length;
	let foundOp = false;

	// Look for comparison operators (they split key from value)
	for (const { search, op: opStr } of comparisonOps) {
		let searchIndex = 0;
		
		// Find all occurrences of this operator
		while (true) {
			const matchIndex = trimmed.indexOf(search, searchIndex);
			if (matchIndex === -1) break;
			
			const beforeMatch = trimmed.slice(0, matchIndex);
			const afterMatch = trimmed.slice(matchIndex + search.length);
			
			// Count quotes before match to ensure we're not inside a quoted string
			const quotesBefore = (beforeMatch.match(/"/g) || []).length;
			const inQuotes = quotesBefore % 2 === 1;
			
			// Check if this operator splits key from value
			if (!inQuotes && beforeMatch.trim() && afterMatch.trim()) {
				key = beforeMatch.trim();
				op = opStr;
				valueStr = afterMatch.trim();
				valueStart = start + matchIndex + search.length;
				foundOp = true;
				break;
			}
			
			searchIndex = matchIndex + 1;
		}
		
		if (foundOp) break;
	}

	// If no comparison operator found, check for special operators
	if (!foundOp) {
		// Check for null operator: field?
		const nullMatch = trimmed.match(/^(.+?)\s*\?$/);
		if (nullMatch) {
			key = nullMatch[1].trim();
			op = '?';
			valueStr = '';
			valueStart = start + trimmed.length;
		}
		// Check for fuzzy operator: field~value
		else if (trimmed.includes('~')) {
			const tildeIndex = trimmed.indexOf('~');
			const beforeTilde = trimmed.slice(0, tildeIndex);
			const afterTilde = trimmed.slice(tildeIndex + 1);
			
			// Check if we're not inside quotes
			const quotesBefore = (beforeTilde.match(/"/g) || []).length;
			const inQuotes = quotesBefore % 2 === 1;
			
			if (!inQuotes && beforeTilde.trim()) {
				key = beforeTilde.trim();
				op = '~';
				valueStr = afterTilde.trim();
				valueStart = start + tildeIndex + 1;
				foundOp = true;
			}
		}
		// Check for regex operator: field/pattern/flags
		else if (trimmed.includes('/')) {
			const firstSlashIndex = trimmed.indexOf('/');
			const beforeSlash = trimmed.slice(0, firstSlashIndex);
			const afterSlash = trimmed.slice(firstSlashIndex);
			
			// Check if we're not inside quotes
			const quotesBefore = (beforeSlash.match(/"/g) || []).length;
			const inQuotes = quotesBefore % 2 === 1;
			
			if (!inQuotes && beforeSlash.trim() && testRegexOperator(afterSlash)) {
				key = beforeSlash.trim();
				op = '/';
				valueStr = afterSlash; // Keep full /pattern/flags
				valueStart = start + firstSlashIndex;
				foundOp = true;
			}
		}
		
		// If still no operator found, default to = with entire string as key
		// This handles cases like just "field" which should be treated as "field = true" or similar
		if (!foundOp) {
			key = trimmed;
			op = '=';
			valueStr = '';
			valueStart = start + trimmed.length;
		}
	}

	if (!key) {
		throw new ParseError(`Invalid KVP format: missing key`, start, start + kvpStr.length);
	}

	let negated = false;
	
	// Check for negation modifier on value
	if (valueStr.startsWith('!')) {
		negated = true;
		valueStr = valueStr.slice(1).trim();
	}

	// Parse the value
	const parsedValue = parseValue(valueStr, valueStart, valueEnd);

	return {
		type: 'KVP',
		value: parsedValue,
		key,
		op,
		negated,
		start,
		end: start + kvpStr.length
	};
}

export function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let pos = 0;

	// Stage 1: Collect groups and logical operators
	const segments: Array<{ type: 'group' | 'logical' | 'kvp'; value: string; start: number; end: number }> = [];
	let currentSegment = '';
	let segmentStart = 0;
	let parenDepth = 0;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		const remaining = input.slice(i);

		// Skip whitespace at segment boundaries
		if (/\s/.test(char) && parenDepth === 0 && !currentSegment.trim()) {
			segmentStart = i + 1;
			continue;
		}

		// Check for logical operators (only at top level)
		if (parenDepth === 0) {
			// Match AND: "AND" (word boundary) or "&" or "&&"
			if (remaining.match(/^AND\b/i)) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'AND', start: i, end: i + 3 });
				i += 2; // Skip "AND"
				segmentStart = i + 1;
				continue;
			}
			if (remaining.startsWith('&&')) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'AND', start: i, end: i + 2 });
				i += 1; // Skip "&&"
				segmentStart = i + 1;
				continue;
			}
			if (remaining.startsWith('&') && !remaining.match(/^&\d/)) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'AND', start: i, end: i + 1 });
				segmentStart = i + 1;
				continue;
			}

			// Match OR: "OR" (word boundary) or "|" or "||"
			if (remaining.match(/^OR\b/i)) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'OR', start: i, end: i + 2 });
				i += 1; // Skip "OR"
				segmentStart = i + 1;
				continue;
			}
			if (remaining.startsWith('||')) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'OR', start: i, end: i + 2 });
				i += 1; // Skip "||"
				segmentStart = i + 1;
				continue;
			}
			if (remaining.startsWith('|') && !remaining.match(/^\|\d/)) {
				if (currentSegment.trim()) {
					segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: i });
					currentSegment = '';
				}
				segments.push({ type: 'logical', value: 'OR', start: i, end: i + 1 });
				segmentStart = i + 1;
				continue;
			}
		}

		// Track parentheses
		if (char === '(') {
			parenDepth++;
			currentSegment += char;
		} else if (char === ')') {
			currentSegment += char;
			parenDepth--;
			if (parenDepth === 0 && currentSegment.trim()) {
				segments.push({ type: 'group', value: currentSegment.trim(), start: segmentStart, end: i + 1 });
				currentSegment = '';
				segmentStart = i + 1;
			}
		} else {
			currentSegment += char;
		}
	}

	// Add final segment
	if (currentSegment.trim()) {
		segments.push({ type: 'kvp', value: currentSegment.trim(), start: segmentStart, end: input.length });
	}

	// Stage 2 & 3: Process segments into tokens
	for (const segment of segments) {
		if (segment.type === 'logical') {
			tokens.push({
				type: segment.value === 'AND' ? 'AND' : 'OR',
				value: segment.value,
				start: segment.start,
				end: segment.end
			});
		} else if (segment.type === 'group') {
			// Remove outer parentheses and recursively tokenize
			const innerContent = segment.value.slice(1, -1);
			tokens.push({ type: 'LPAREN', value: '(', start: segment.start, end: segment.start + 1 });
			const innerTokens = tokenize(innerContent);
			// Adjust positions for inner tokens
			for (const token of innerTokens) {
				if (token.type !== 'EOF') {
					tokens.push({
						...token,
						start: token.start + segment.start + 1,
						end: token.end + segment.start + 1
					});
				}
			}
			tokens.push({ type: 'RPAREN', value: ')', start: segment.end - 1, end: segment.end });
		} else if (segment.type === 'kvp') {
			// Split by unquoted spaces to handle implicit AND
			const kvpParts = splitByUnquotedSpaces(segment.value);
			for (let i = 0; i < kvpParts.length; i++) {
				if (i > 0) {
					// Implicit AND between KVPs
					tokens.push({
						type: 'AND',
						value: 'AND',
						start: segment.start,
						end: segment.start
					});
				}
				const kvpToken = parseKVP(kvpParts[i], segment.start);
				tokens.push(kvpToken);
			}
		}
	}

	tokens.push({ type: 'EOF', value: '', start: input.length, end: input.length });
	return tokens;
}
