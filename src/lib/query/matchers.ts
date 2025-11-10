import type { ComparisonOperator, MultiValue, Single, Range, FieldMatcher } from './types';

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
 * Compares a string value with a parsed value using the specified operator.
 * Supports == (contains or regex.test), != (negated), ~= (fuzzy).
 * Returns false if taskString is undefined/null for most operators.
 * Note: Collections are handled by the evaluator, so this only receives Single values.
 */
export function compareString(
	taskString: string | undefined | null,
	op: ComparisonOperator,
	parsedValue: Single<string | RegExp>
): boolean {
	// Strings don't support ranges, so this should always be Single
	if (parsedValue.kind !== 'single') {
		throw new Error('String comparison does not support range values');
	}

	const single = parsedValue as Single<string | RegExp>;
	const value = single.data;

	// For other operators, return false if taskString is undefined/null
	if (!taskString) {
		return false;
	}

	switch (op) {
		case '==':
			// Contains for string, regex.test for RegExp
			if (value instanceof RegExp) {
				return value.test(taskString);
			}
			if (typeof value === 'string') {
				return taskString.toLowerCase().includes(value.toLowerCase());
			}
			return false;

		case '!=':
			// Negated version of ==
			if (value instanceof RegExp) {
				return !value.test(taskString);
			}
			if (typeof value === 'string') {
				return !taskString.toLowerCase().includes(value.toLowerCase());
			}
			return false;

		case '~=':
			// Fuzzy search (only for string needles)
			if (value instanceof RegExp) {
				throw new Error('Fuzzy operator (~=) does not support RegExp values');
			}
			if (typeof value === 'string') {
				return fuzzyMatch(taskString, value);
			}
			return false;

		case '>=':
		case '<=':
		case '>':
		case '<':
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
	value: number | undefined | null,
	op: ComparisonOperator,
	compareTo: MultiValue<number>
): boolean {
	const numValue = value ?? 0;

	// Handle range
	if (compareTo.kind === 'range') {
		const range = compareTo as Range<number>;
		const lower = range.lower;
		const upper = range.upper;
		const inclusive = range.inclusive !== false; // default to true

		switch (op) {
			case '==':
				return inclusive
					? numValue >= lower && numValue <= upper
					: numValue > lower && numValue < upper;
			case '!=':
				return inclusive
					? numValue < lower || numValue > upper
					: numValue <= lower || numValue >= upper;
			case '>=':
				return numValue >= lower;
			case '<=':
				return numValue <= upper;
			case '>':
				return numValue > upper;
			case '<':
				return numValue < lower;
			default:
				throw new Error(`Invalid operator for number range: ${op}`);
		}
	}

	// Handle single number
	const single = compareTo as Single<number>;
	const compareNum = single.data;

	switch (op) {
		case '==':
			return numValue === compareNum;
		case '!=':
			return numValue !== compareNum;
		case '>=':
			return numValue >= compareNum;
		case '<=':
			return numValue <= compareNum;
		case '>':
			return numValue > compareNum;
		case '<':
			return numValue < compareNum;
		case '~=':
			throw new Error('Fuzzy operator (~=) not supported for numeric comparison');
		default:
			throw new Error(`Invalid operator for numeric comparison: ${op}`);
	}
}

/**
 * Compares a date value with a parsed date value (Date or relative date).
 * Returns false if the task date is undefined/null.
 */
export function compareDate(
	taskDate: Date | undefined | null,
	op: ComparisonOperator,
	parsedValue: MultiValue<Date>
): boolean {
	if (!taskDate) {
		return false;
	}

	const taskTime = taskDate.getTime();

	// Handle range
	if (parsedValue.kind === 'range') {
		const range = parsedValue as Range<Date>;
		const rangeTop = range.upper.getTime();
		const rangeBottom = range.lower.getTime();
		const inclusive = range.inclusive !== false; // default to true

		switch (op) {
			case '==':
				// For equality with range, check if within range
				return inclusive
					? taskTime >= rangeBottom && taskTime <= rangeTop
					: taskTime > rangeBottom && taskTime < rangeTop;
			case '!=':
				return inclusive
					? taskTime < rangeBottom || taskTime > rangeTop
					: taskTime <= rangeBottom || taskTime >= rangeTop;
			case '>=':
				return taskTime >= rangeBottom;
			case '<=':
				return taskTime <= rangeTop;
			case '>':
				return taskTime > rangeTop;
			case '<':
				return taskTime < rangeBottom;
			case '~=':
				throw new Error('Fuzzy operator (~=) not supported for date comparison');
			default:
				throw new Error(`Invalid operator for date range: ${op}`);
		}
	}

	// Handle single Date value
	const single = parsedValue as Single<Date>;
	const compareDate = single.data;
	if (!(compareDate instanceof Date)) {
		throw new Error('Expected Date instance for single date comparison');
	}
	const compareTime = compareDate.getTime();

	switch (op) {
		case '==':
			// For equality, check if dates are on the same day (within 24 hours)
			return Math.abs(taskTime - compareTime) < 24 * 60 * 60 * 1000;
		case '!=':
			return Math.abs(taskTime - compareTime) >= 24 * 60 * 60 * 1000;
		case '>=':
			return taskTime >= compareTime;
		case '<=':
			return taskTime <= compareTime;
		case '>':
			return taskTime > compareTime;
		case '<':
			return taskTime < compareTime;
		case '~=':
			throw new Error('Fuzzy operator (~=) not supported for date comparison');
		default:
			throw new Error(`Invalid operator: ${op}`);
	}
}