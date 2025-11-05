import type { Task } from '$domain/models/task';

export type QueryOperator = '=' | '>' | '<' | '>=' | '<=';

export type ParsedValue =
	| string
	| number
	| Date
	| boolean
	| { type: 'relative'; amount: number; unit: 'day' | 'week' | 'month' | 'year' };

export type ValueParser<T extends ParsedValue> = (value: string) => T;

export type FieldMatcher<T extends ParsedValue> = (task: Task, op: QueryOperator, parsedValue: T) => boolean;

export interface FieldHandler<T extends ParsedValue> {
	parseValue: ValueParser<T>;
	matches: FieldMatcher<T>;
	autocomplete?: (value: string) => string[];
}

/**
 * Helper function to create a type-safe field handler.
 * Ensures parseValue returns the same type that matches expects.
 */
export function fieldHandler<T extends ParsedValue>(handler: FieldHandler<T>): FieldHandler<any> {
	return handler;
}

/**
 * Registry type that allows each field to have its own specific ParsedValue type.
 * Individual handlers are type-safe via fieldHandler<T>, but the registry
 * accepts any FieldHandler<ParsedValue> to allow heterogeneous collections.
 */
export type FieldRegistry = Record<string, FieldHandler<ParsedValue>>;
