import { TaskStatus } from '$domain/models/task';
import type { Task } from '$domain/models/task';
import type { FieldRegistry, FieldHandler, ParsedValue } from '$lib/query/types';
import { fieldHandler } from '$lib/query/types';
import { parseDateValue } from '$lib/query/dateParser';
import { compareDate } from '$lib/query/matchers';

type DateValue = Date | { type: 'relative'; amount: number; unit: 'day' | 'week' | 'month' | 'year' };

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

export const taskQueryFieldRegistry: FieldRegistry<Task> = {
	status: fieldHandler<Task, TaskStatus>({
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

	dueDate: fieldHandler<Task, DateValue>({
		parseValue: parseDateValue as (value: string) => DateValue,
		matches: (task, op, parsedValue) => {
			return compareDate(task.dueDate, op, parsedValue);
		}
	}),
};

