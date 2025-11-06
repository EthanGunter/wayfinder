import { TaskStatus } from '$domain/models/task';
import type { Task } from '$domain/models/task';
import type { FieldRegistry, ParsedValue, DateValue, FieldHandler } from '$lib/query/types';
import { fieldHandler as fh } from '$lib/query/types';
import { parseDateValue } from '$lib/query/dateParser';
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

const fieldHandler = <T extends ParsedValue>(handler: FieldHandler<Task, T>) => fh<Task, T>(handler);

export const taskQueryFieldRegistry: FieldRegistry<Task> = {
	/* TODO: allow searching by username/role/email whatever.
	This is a complicated one, and relies on an expansion of the user system
	*/
	// user: fieldHandler({} as any),

	// Content
	title: fieldHandler<string>({
		parseValue: value => {
			console.log('[title parseValue()]:', value);
			return value;
		},
		matches: (task, op, parsed) => compareString(task.title, op, parsed),
	}),
	content: fieldHandler<string>({
		parseValue: (value) => {
			console.log('[content parseValue()]:', value);
			return value;
		},
		matches: (task, op, parsed) => compareString(task.content, op, parsed),
	}),
	status: fieldHandler<TaskStatus>({
		parseValue: (value) => {
			const normalized = value.toLowerCase();
			if (normalized === 'complete') return TaskStatus.complete;
			else if (normalized === 'incomplete') return TaskStatus.incomplete;
			throw new Error('Invalid status: ${value}. Must be `complete` or `incomplete`');
		},
		matches: (task, op, parsedValue) => {
			return task.status === parsedValue;
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
	todaysTask: fieldHandler<DateValue>({
		parseValue: parseDateValue,
		matches: (task, op, parsedValue) => compareDate(task.dueDate, op, parsedValue)
	}),
	dueDate: fieldHandler<DateValue>({
		parseValue: parseDateValue,
		matches: (task, op, parsedValue) => compareDate(task.dueDate, op, parsedValue)
	}),

	// Metadata
	created: fieldHandler({} as any),
	lastEdit: fieldHandler({} as any),
};

