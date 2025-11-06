import type { ParsedValue } from './types';

/**
 * Parses date values from query strings.
 * Supports:
 * - Relative dates: "1week", "3days", "2months", "1year"
 * - Absolute dates: "2025-01-01", ISO dates
 * - Special keywords: "today", "tomorrow", "yesterday"
 */
export function parseDateValue(value: string): ParsedValue {
	const trimmed = value.trim().toLowerCase();

	// Special keywords
	if (trimmed === 'today') {
		return new Date();
	}
	if (trimmed === 'tomorrow') {
		const date = new Date();
		date.setDate(date.getDate() + 1);
		return date;
	}
	if (trimmed === 'yesterday') {
		const date = new Date();
		date.setDate(date.getDate() - 1);
		return date;
	}

	// Relative dates: "1week", "3days", "2months", "1year"
	const relativeMatch = value.match(/^(\d+)(day|week|month|year)s?$/i);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1], 10);
		const unit = relativeMatch[2].toLowerCase() as 'day' | 'week' | 'month' | 'year';
		return { type: 'relative', amount, unit };
	}

	// Absolute dates: ISO format "2025-01-01" or full ISO string
	const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
	if (dateMatch) {
		const parsed = new Date(value);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	// Try parsing as Date directly
	const parsed = new Date(value);
	if (!isNaN(parsed.getTime())) {
		return parsed;
	}

	throw new Error(`Invalid date value: ${value}`);
}

/**
 * Converts relative date to absolute Date for comparison
 */
export function resolveRelativeDate(relative: { type: 'relative'; amount: number; unit: 'day' | 'week' | 'month' | 'year' }): Date {
	const now = new Date();
	const date = new Date(now);

	switch (relative.unit) {
		case 'day':
			date.setDate(date.getDate() + relative.amount);
			break;
		case 'week':
			date.setDate(date.getDate() + relative.amount * 7);
			break;
		case 'month':
			date.setMonth(date.getMonth() + relative.amount);
			break;
		case 'year':
			date.setFullYear(date.getFullYear() + relative.amount);
			break;
	}

	return date;
}

