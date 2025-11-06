import type { QueryOperator, ParsedValue } from './types';
import { resolveRelativeDate } from './dateParser';

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
	}
}

/**
 * Compares a date value with a parsed date value (Date or relative date).
 * Returns false if the task date is undefined/null.
 */
export function compareDate(
	taskDate: Date | undefined,
	op: QueryOperator,
	parsedValue: Date | { type: 'relative'; amount: number; unit: 'day' | 'week' | 'month' | 'year' }
): boolean {
	if (!taskDate) {
		return false;
	}

	const taskTime = taskDate.getTime();
	let compareTime: number;

	if (parsedValue instanceof Date) {
		compareTime = parsedValue.getTime();
	} else if (typeof parsedValue === 'object' && parsedValue.type === 'relative') {
		const resolved = resolveRelativeDate(parsedValue);
		compareTime = resolved.getTime();
	} else {
		throw new Error(`Invalid date value type for comparison`);
	}

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
	}
}

