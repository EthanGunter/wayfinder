import { TaskStatus } from '$domain/models/task';
import type { Task } from '$domain/models/task';
import type { FieldRegistry } from '$lib/query/types';
import { fieldHandler, compareOps, valueOps, ValueTransformError } from '$lib/query/types';
import { parseDateValue } from '$lib/query/valueTransformers';
import { compareDate, compareString } from '$lib/query/matchers';

/**
 * PLANNED HANDLERS
 * Numeric/date:
 *		= exact (implied default)
 *		> greater than
 *		< less than
 *		>= greater or equal
 *		<= less or equal
 *		.. inclusive range: amount:10..20, dates: created:2025-01-01..2025-01-31
 *		+/-/±: +/-/±5 of preceding anchor. value:±tolerance (typing +- or -+ replaces with ±)
 *		[ & ] in-set (CSV): priority:[1,2,3]
 *		? is null
 * 	
 * Strings:
 *		= contains (case-insensitive) (implied default)
 *		~ fuzzy search
 *		/ regex (allow trailing flags): /^foo/i
 *		[ & ] in-set (CSV): title:~[bug,fix,"new feature"]
 *		? is empty
 * 
 * 
 * LOGICAL OPERATORS:
 * 		'AND', 'and', '&', '&&'
 * 		'OR', 'or', '|', '||'
 * 		'(' & ')': group expressions
 */

// const fieldHandler = <T extends ParsedValue>(handler: Parameters<typeof fh<Task, T>>[0]) => fh<Task, T>(handler);

// TODO I didn't know where to put this so it's going here
// We should support transforming custom value variable, similar to how today (in `date==today`) is handled.
// I don't know what these values would be based on if not universal values like today's date
// but it would make the tolerance values more meaningful (1+-5 is always -4..6)
export const taskQueryFieldRegistry: FieldRegistry<Task> = {
	/* TODO: allow searching by username/role/email whatever.
	This is a complicated one, and relies on an expansion of the user system
	*/
	// user: fieldHandler({} as any),

	// Content
	title: fieldHandler({
		operators: compareOps('==', '!=', '~='),
		valueOps: valueOps(),
		transformValue: raw => {
			console.log('[title parseValue()]:', raw);
			return raw;
		},
		matches: (task, op, value) => compareString(task.data.title, op, value),
	}),
	content: fieldHandler({
		operators: compareOps('==', '!=', '~='),
		valueOps: valueOps(),
		transformValue: (value) => {
			console.log('[content parseValue()]:', value);
			return value;
		},
		matches: (task, op, value) => compareString(task.data.content, op, value),
	}),
	status: fieldHandler({
		operators: compareOps('==', '!='),
		valueOps: valueOps(),
		transformValue: (raw) => {
			const normalized = raw.toLowerCase();
			if (normalized === 'complete') return TaskStatus.complete;
			else if (normalized === 'incomplete') return TaskStatus.incomplete;
			throw new ValueTransformError(`Invalid status: ${raw}. Must be 'complete' or 'incomplete'`);
		},
		matches: (task, op, value) => {
			return task.data.status === value.data;
		},
		autocomplete: (value) => {
			const normalized = value.toLowerCase();
			const options = ['complete', 'incomplete'];
			if (!normalized) return options;
			return options.filter((opt) => opt.startsWith(normalized));
		}
	}),

	/* TODO: Need to implement array-based queries
	* `parents.name:any:~design` 
	* supported - any:, all:, none:, size:
	* This is task-specific, and will require a refactor of the query system to support non-standard fields...
	*/
	// parents: fieldHandler({} as any),
	// children: fieldHandler({} as any),

	// TODO: todaysTask should also handle no operator, and be treated as a boolean
	todaysTask: fieldHandler({
		operators: compareOps('==', '!=', '>=', '<=', '>', '<'),
		valueOps: valueOps('..', '+', '-'),
		cardinality: 'single',
		arith: {
			// For tolerance, the second Date represents a duration
			// We calculate the difference from epoch to get milliseconds
			add: (a: Date, b: Date) => {
				const result = new Date(a);
				const durationMs = b.getTime(); // Duration stored as ms since epoch
				result.setTime(result.getTime() + durationMs);
				return result;
			},
			sub: (a: Date, b: Date) => {
				const result = new Date(a);
				const durationMs = b.getTime();
				result.setTime(result.getTime() - durationMs);
				return result;
			}
		},
		transformValue: parseDateValue,
		matches: (task, op, value) => compareDate(task.data.dueDate, op, value)
	}),
	dueDate: fieldHandler({
		operators: compareOps('==', '!=', '>=', '<=', '>', '<'),
		valueOps: valueOps('..', '+', '-'),
		cardinality: 'single',
		arith: {
			add: (a: Date, b: Date) => {
				const result = new Date(a);
				const durationMs = b.getTime();
				result.setTime(result.getTime() + durationMs);
				return result;
			},
			sub: (a: Date, b: Date) => {
				const result = new Date(a);
				const durationMs = b.getTime();
				result.setTime(result.getTime() - durationMs);
				return result;
			}
		},
		transformValue: parseDateValue,
		matches: (task, op, value) => compareDate(task.data.dueDate, op, value)
	}),

	// Metadata
	// created: fieldHandler({} as any),
	// lastEdit: fieldHandler({} as any),
};