import { ValueTransformError } from './types';

// ============================================================================
// Regex Patterns
// ============================================================================

/** Matches relative date expressions: "1day", "3weeks", "2months", "1year" */
const REGEX_RELATIVE_DATE = /^(\d+)(day|week|month|year)s?$/i;

// ============================================================================

/**
 * Parses date values from query strings.
 * Supports:
 * - Relative dates: "1week", "3days", "2months", "1year"
 * - Absolute dates: "2025-01-01", ISO dates
 * - Special keywords: "today", "tomorrow", "yesterday"
 * @throws ValueTransformError if the value cannot be parsed as a date
 */
export function parseDateValue(value: string): Date {
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
	const relativeMatch = value.match(REGEX_RELATIVE_DATE);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1], 10);
		const unit = relativeMatch[2].toLowerCase() as 'day' | 'week' | 'month' | 'year';
		// Convert relative date to absolute Date
		const now = new Date();
		const date = new Date(now);

		switch (unit) {
			case 'day':
				date.setDate(date.getDate() + amount);
				break;
			case 'week':
				date.setDate(date.getDate() + amount * 7);
				break;
			case 'month':
				date.setMonth(date.getMonth() + amount);
				break;
			case 'year':
				date.setFullYear(date.getFullYear() + amount);
				break;
		}

		return date;
	}

	// Try parsing as Date directly
	const parsed = new Date(value);
	if (!isNaN(parsed.getTime())) {
		return parsed;
	}

	throw new ValueTransformError(`Invalid date value: ${value}. Expected a date format like "2025-01-01", "today", "tomorrow", or relative dates like "1week", "3days"`);
}


/**
 * Parses a relative date string as a duration in milliseconds.
 * Used for tolerance values in date arithmetic.
 * Examples: "5days" -> 5 days in ms, "1week" -> 1 week in ms
 * Note: This is a workaround - ideally tolerance values would be parsed as durations,
 * but the spec requires using transformValue for both anchor and tolerance.
 */
function parseDateDuration(value: string): Date {
	const trimmed = value.trim().toLowerCase();
	
	// Relative dates: "1week", "3days", "2months", "1year"
	const relativeMatch = trimmed.match(REGEX_RELATIVE_DATE);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1], 10);
		const unit = relativeMatch[2].toLowerCase() as 'day' | 'week' | 'month' | 'year';
		
		// Create a date representing the duration
		// We'll use the epoch as a base and add the duration
		const base = new Date(0);
		switch (unit) {
			case 'day':
				base.setDate(base.getDate() + amount);
				break;
			case 'week':
				base.setDate(base.getDate() + amount * 7);
				break;
			case 'month':
				base.setMonth(base.getMonth() + amount);
				break;
			case 'year':
				base.setFullYear(base.getFullYear() + amount);
				break;
		}
		return base; // This represents the duration as milliseconds since epoch
	}
	
	// If not a relative date, try parsing as absolute date
	// For tolerance, this is less common but we'll support it
	return parseDateValue(value);
}