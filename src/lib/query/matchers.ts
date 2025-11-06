import type { QueryOperator, ParsedValue, DateValue } from './types';

/**
 * Checks if all characters in search string appear in order within target string (case-insensitive).
 * Used for fuzzy matching.
 */
function fuzzyMatch(target: string, search: string): boolean {
	const targetLower = target.toLowerCase();
	const searchLower = search.toLowerCase();
	
	let searchIndex = 0;
	for (let i = 0; i < targetLower.length && searchIndex < searchLower.length; i++) {
		if (targetLower[i] === searchLower[searchIndex]) {
			searchIndex++;
		}
	}
	
	return searchIndex === searchLower.length;
}

/**
 * Parses a regex pattern from the format /pattern/flags
 * Returns null if invalid format or pattern
 */
function parseRegex(pattern: string): RegExp | null {
	const trimmed = pattern.trim();
	if (!trimmed.startsWith('/')) {
		return null;
	}
	
	// Find the last / which separates pattern from flags
	const lastSlashIndex = trimmed.lastIndexOf('/');
	if (lastSlashIndex === 0) {
		// Only one /, no flags
		try {
			return new RegExp(trimmed.slice(1));
		} catch {
			return null;
		}
	}
	
	const regexPattern = trimmed.slice(1, lastSlashIndex);
	const flags = trimmed.slice(lastSlashIndex + 1);
	
	try {
		return new RegExp(regexPattern, flags);
	} catch {
		return null;
	}
}

/**
 * Compares a string value with a parsed string value using the specified operator.
 * Supports contains (=), fuzzy (~), regex (/), empty (?), and in-set array matching.
 * Returns false if taskString is undefined/null for most operators.
 */
export function compareString(
	taskString: string | undefined,
	op: QueryOperator,
	parsedValue: string | ParsedValue[]
): boolean {
	// Handle array (in-set matching)
	if (Array.isArray(parsedValue)) {
		// Check if taskString matches ANY element in the array
		return parsedValue.some((value) => {
			// Only process string values in the array
			if (typeof value === 'string') {
				return compareString(taskString, op, value);
			}
			return false;
		});
	}

	// Ensure parsedValue is a string at this point
	if (typeof parsedValue !== 'string') {
		throw new Error('Expected string value for string comparison');
	}

	// Handle empty operator
	if (op === '?') {
		return !taskString || taskString.trim() === '';
	}

	// For other operators, return false if taskString is undefined/null
	if (!taskString) {
		return false;
	}

	switch (op) {
		case '=':
			// Contains (case-insensitive)
			return taskString.toLowerCase().includes(parsedValue.toLowerCase());

		case '~':
			// Fuzzy search
			return fuzzyMatch(taskString, parsedValue);

		case '/':
			// Regex
			const regex = parseRegex(parsedValue);
			if (!regex) {
				return false;
			}
			return regex.test(taskString);

		case '<':
		case '>':
		case '<=':
		case '>=':
			// These operators don't make sense for strings
			throw new Error(`Invalid operator for string comparison: ${op}`);

		default:
			throw new Error(`Invalid operator: ${op}`);
	}
}

/**
 * Compares two numeric values using the specified operator.
 * Handles undefined/null values by treating them as 0.
 */
export function compareNumeric(
	value: number | undefined,
	op: QueryOperator,
	compareTo: number
): boolean {
	const numValue = value ?? 0;

	switch (op) {
		case '=':
			return numValue === compareTo;
		case '<':
			return numValue < compareTo;
		case '>':
			return numValue > compareTo;
		case '<=':
			return numValue <= compareTo;
		case '>=':
			return numValue >= compareTo;
		default:
			throw new Error(`Invalid operator for numeric comparison: ${op}`);
	}
}

/**
 * Compares a date value with a parsed date value (Date or relative date).
 * Returns false if the task date is undefined/null.
 */
export function compareDate(
	taskDate: Date | undefined,
	op: QueryOperator,
	parsedValue: DateValue
): boolean {
	if (!taskDate) {
		return false;
	}

	const taskTime = taskDate.getTime();

	// Handle date-range types
	if (typeof parsedValue === 'object' && 'type' in parsedValue && parsedValue.type === 'date-range') {
		// For ranges, check if taskDate falls within the range
		const rangeTop = parsedValue.rangeTop.getTime();
		const rangeBottom = parsedValue.rangeBottom.getTime();
		
		switch (op) {
			case '=':
				// For equality with range, check if within range
				return taskTime >= rangeBottom && taskTime <= rangeTop;
			case '<':
				return taskTime < rangeBottom;
			case '>':
				return taskTime > rangeTop;
			case '<=':
				return taskTime <= rangeTop;
			case '>=':
				return taskTime >= rangeBottom;
			default:
				throw new Error(`Invalid operator for date range: ${op}`);
		}
	}

	// Handle single Date value (must be Date instance at this point)
	if (!(parsedValue instanceof Date)) {
		throw new Error('Expected Date instance for single date comparison');
	}
	const compareTime = parsedValue.getTime();

	switch (op) {
		case '=':
			// For equality, check if dates are on the same day (within 24 hours)
			return Math.abs(taskTime - compareTime) < 24 * 60 * 60 * 1000;
		case '<':
			return taskTime < compareTime;
		case '>':
			return taskTime > compareTime;
		case '<=':
			return taskTime <= compareTime;
		case '>=':
			return taskTime >= compareTime;
		default:
			throw new Error(`Invalid operator: ${op}`);
	}
}

